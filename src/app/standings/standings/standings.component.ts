import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MlbApiService } from '../../shared/mlb-api.service';
import { TeamDataService } from '../../shared/team-data.service';
import { SeoService } from '../../shared/seo.service';

interface TeamRow {
  teamId: number; teamName: string;
  wins: number; losses: number; pct: string;
  gb: string; wcGb?: string; rank: number; wcRank?: number;
  divisionLeader?: boolean;
  divisionShortName?: string;
  /** 1-6 postseason seed within its league, set only on bracket-seed lists. */
  seed?: number;
}

interface Division {
  name: string; shortName: string; teams: TeamRow[];
}

/** One side of a bracket matchup: either a known, seeded team, or a
 *  placeholder for a team that hasn't been decided yet (e.g. "Winner of
 *  (4) / (5)"). Division Series onward is mostly `team: null` until the
 *  earlier rounds are actually played. */
interface BracketSlot {
  team: TeamRow | null;
  label: string;
}

@Component({
  selector: 'app-standings',
  templateUrl: './standings.component.html',
  styleUrl: './standings.component.scss',
  standalone: false
})
export class StandingsComponent implements OnInit {
  activeTab: 'DIV' | 'WC' | 'BRACKET' = 'DIV';
  loading = true;

  alDivisions: Division[] = [];
  nlDivisions: Division[] = [];
  alDivisionLeaders: TeamRow[] = [];
  nlDivisionLeaders: TeamRow[] = [];
  alWildCard: TeamRow[] = [];
  nlWildCard: TeamRow[] = [];

  /** Seeds 1-6 per league for the Postseason Bracket tab: the 3 division
   *  leaders (by record) followed by the 3 wild card teams (by wcRank). */
  alSeeds: TeamRow[] = [];
  nlSeeds: TeamRow[] = [];

  /** The 12-team format with byes for the top TWO seeds took effect in 2026
   *  (2022-2025 gave a bye to only the #1 seed; earlier eras used entirely
   *  different formats with no wild card series at all). Rather than model
   *  every historical format, the bracket only renders for the current
   *  rules and shows an explanatory note for earlier seasons. */
  readonly bracketFormatStartYear = 2026;
  get usesBracketFormat(): boolean { return this.season >= this.bracketFormatStartYear; }

  season = new Date().getFullYear();
  /** Years available in the season picker (descending). Standings begin in 1901 (modern AL/NL era). */
  readonly years: number[] = (() => {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now; y >= 1901; y--) out.push(y);
    return out;
  })();

  constructor(private api: MlbApiService, public teams: TeamDataService, private router: Router, private seo: SeoService) {}

  ngOnInit() {
    this.seo.update(
      'MLB Standings — AL & NL Division and Wild Card Standings | Baseball Nerd',
      'Current MLB standings for the American and National League, updated daily with wins, losses, games behind, run differential, and separate wild card tracking.'
    );
    this.loadStandings();
  }

  goToTeam(teamId: number) {
    if (teamId) this.router.navigate(['/team-schedule', teamId]);
  }

  selectSeason(year: number) {
    if (this.season === year) return;
    this.season = year;
    // Reset previous data so the old standings don't flash while loading.
    this.alDivisions = [];
    this.nlDivisions = [];
    this.alDivisionLeaders = [];
    this.nlDivisionLeaders = [];
    this.alWildCard = [];
    this.nlWildCard = [];
    this.alSeeds = [];
    this.nlSeeds = [];
    this.loadStandings();
  }

  trackByYear(_: number, y: number) { return y; }

  loadStandings() {
    this.loading = true;
    this.api.getStandings(this.season).subscribe({
      next: (data) => {
        this.buildDivisions(data.records || []);
        this.api.getWildCard(this.season).subscribe({
          next: (wc) => {
            this.buildWildCard(wc.records || []);
            this.alSeeds = this.buildBracketSeeds(this.alDivisionLeaders, this.alWildCard);
            this.nlSeeds = this.buildBracketSeeds(this.nlDivisionLeaders, this.nlWildCard);
            this.loading = false;
          },
          error: () => { this.loading = false; }
        });
      },
      error: () => { this.loading = false; }
    });
  }

  buildDivisions(records: any[]) {
    const leagueAbbr: Record<number, string> = { 103: 'AL', 104: 'NL' };
    const divMap: Record<string, Division> = {};

    records.forEach(rec => {
      const lg = leagueAbbr[rec.league?.id];
      if (!lg) return;
      const divName = rec.division?.name || 'Unknown';
      const short = divName.replace('American League ', 'AL ').replace('National League ', 'NL ');
      if (!divMap[divName]) divMap[divName] = { name: divName, shortName: short, teams: [] };
      (rec.teamRecords || []).forEach((tr: any) => {
        divMap[divName].teams.push({
          teamId: tr.team?.id, teamName: tr.team?.name,
          wins: tr.wins, losses: tr.losses,
          pct: tr.winningPercentage, gb: tr.gamesBack,
          rank: parseInt(tr.divisionRank) || 0,
          wcGb: tr.wildCardGamesBack,
        });
      });
      divMap[divName].teams.sort((a, b) => a.rank - b.rank);
    });

    const alOrder = ['American League East','American League Central','American League West'];
    const nlOrder = ['National League East','National League Central','National League West'];
    this.alDivisions = alOrder.map(n => divMap[n]).filter(Boolean);
    this.nlDivisions = nlOrder.map(n => divMap[n]).filter(Boolean);

    // Extract the rank-1 team from each division for the Wild Card tab,
    // ordered by winning percentage (not division order) — this is what
    // actually determines seeds 1-3 in the postseason bracket.
    const byPctDesc = (a: TeamRow, b: TeamRow) => parseFloat(b.pct) - parseFloat(a.pct);

    this.alDivisionLeaders = this.alDivisions
      .map(div => ({ ...div.teams[0], divisionShortName: div.shortName }))
      .filter(Boolean)
      .sort(byPctDesc);
    this.nlDivisionLeaders = this.nlDivisions
      .map(div => ({ ...div.teams[0], divisionShortName: div.shortName }))
      .filter(Boolean)
      .sort(byPctDesc);
  }

  buildWildCard(records: any[]) {
    const leagueAbbr: Record<number, string> = { 103: 'AL', 104: 'NL' };
    const al: TeamRow[] = [], nl: TeamRow[] = [];
    records.forEach(rec => {
      const lg = leagueAbbr[rec.league?.id];
      (rec.teamRecords || []).forEach((tr: any) => {
        const row: TeamRow = {
          teamId: tr.team?.id, teamName: tr.team?.name,
          wins: tr.wins, losses: tr.losses,
          pct: tr.winningPercentage, gb: tr.gamesBack,
          wcGb: tr.wildCardGamesBack,
          rank: 0, wcRank: parseInt(tr.wildCardRank) || 99
        };
        if (lg === 'AL') al.push(row); else nl.push(row);
      });
    });
    this.alWildCard = al.sort((a, b) => (a.wcRank ?? 99) - (b.wcRank ?? 99));
    this.nlWildCard = nl.sort((a, b) => (a.wcRank ?? 99) - (b.wcRank ?? 99));
  }

  /** Combines the 3 division leaders (seeds 1-3, already ordered by record)
   *  with the top 3 wild card teams (seeds 4-6, already ordered by
   *  wcRank) into one 1-6 seed list for the bracket. Returns [] rather
   *  than a partial list if either side is short a team — a half-built
   *  bracket is worse than a clear "not enough data yet" state. */
  private buildBracketSeeds(divisionLeaders: TeamRow[], wildCard: TeamRow[]): TeamRow[] {
    if (divisionLeaders.length !== 3) return [];
    const topWc = wildCard
      .filter(t => (t.wcRank ?? 99) <= 3)
      .sort((a, b) => (a.wcRank ?? 99) - (b.wcRank ?? 99));
    if (topWc.length !== 3) return [];
    return [...divisionLeaders, ...topWc].map((t, i) => ({ ...t, seed: i + 1 }));
  }

  /** Wild Card Series matchups: (3) hosts (6), (4) hosts (5). No reseeding
   *  happens after this round — the survivors' Division Series opponents
   *  are fixed no matter which teams actually win (confirmed against
   *  MLB's own postseason-format explainer, mlb.com/news/mlb-playoff-format-faq). */
  get alWildCardMatchups(): BracketSlot[][] {
    return this.alSeeds.length === 6
      ? [[this.knownSlot(this.alSeeds[2]), this.knownSlot(this.alSeeds[5])],
         [this.knownSlot(this.alSeeds[3]), this.knownSlot(this.alSeeds[4])]]
      : [];
  }
  get nlWildCardMatchups(): BracketSlot[][] {
    return this.nlSeeds.length === 6
      ? [[this.knownSlot(this.nlSeeds[2]), this.knownSlot(this.nlSeeds[5])],
         [this.knownSlot(this.nlSeeds[3]), this.knownSlot(this.nlSeeds[4])]]
      : [];
  }

  /** Division Series: seed 1 always faces the (4)/(5) winner, seed 2 always
   *  faces the (3)/(6) winner — fixed in advance, not reseeded. */
  get alDivisionSeries(): BracketSlot[][] {
    return this.alSeeds.length === 6
      ? [[this.knownSlot(this.alSeeds[0]), this.tbdSlot('Winner of (4) / (5)')],
         [this.knownSlot(this.alSeeds[1]), this.tbdSlot('Winner of (3) / (6)')]]
      : [];
  }
  get nlDivisionSeries(): BracketSlot[][] {
    return this.nlSeeds.length === 6
      ? [[this.knownSlot(this.nlSeeds[0]), this.tbdSlot('Winner of (4) / (5)')],
         [this.knownSlot(this.nlSeeds[1]), this.tbdSlot('Winner of (3) / (6)')]]
      : [];
  }

  /** Championship Series: the two Division Series winners in that league. */
  get alChampionshipSeries(): BracketSlot[][] {
    return this.alSeeds.length === 6
      ? [[this.tbdSlot('Winner of (1) Series'), this.tbdSlot('Winner of (2) Series')]]
      : [];
  }
  get nlChampionshipSeries(): BracketSlot[][] {
    return this.nlSeeds.length === 6
      ? [[this.tbdSlot('Winner of (1) Series'), this.tbdSlot('Winner of (2) Series')]]
      : [];
  }

  /** World Series: the two league champions. */
  get worldSeries(): BracketSlot[][] {
    return (this.alSeeds.length === 6 && this.nlSeeds.length === 6)
      ? [[this.tbdSlot('AL Champion'), this.tbdSlot('NL Champion')]]
      : [];
  }

  private knownSlot(team: TeamRow): BracketSlot { return { team, label: '' }; }
  private tbdSlot(label: string): BracketSlot { return { team: null, label }; }

  isGbLeader(gb: string) { return gb === '-' || gb === '0.0' || gb === '0'; }
  logoError(ev: Event)   { (ev.target as HTMLImageElement).style.display = 'none'; }
}
