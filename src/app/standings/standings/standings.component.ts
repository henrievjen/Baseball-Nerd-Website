import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MlbApiService } from '../../shared/mlb-api.service';
import { TeamDataService } from '../../shared/team-data.service';
import { SeoService } from '../../shared/seo.service';
import { BracketModel, ProjectedSeeds, TeamInfo, TeamResolver, buildBracket, makeTeamResolver } from '../bracket/bracket-model';
import { WcView, buildWildCardView, wildCardFormat } from './wild-card-format';

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

@Component({
  selector: 'app-standings',
  templateUrl: './standings.component.html',
  styleUrl: './standings.component.scss',
  standalone: false
})
export class StandingsComponent implements OnInit, OnDestroy {
  activeTab: 'DIV' | 'WC' | 'BRACKET' = 'DIV';
  loading = true;

  alDivisions: Division[] = [];
  nlDivisions: Division[] = [];
  alDivisionLeaders: TeamRow[] = [];
  nlDivisionLeaders: TeamRow[] = [];
  alWildCard: TeamRow[] = [];
  nlWildCard: TeamRow[] = [];

  /** Wild Card tab: what that season's format was (0–3 Wild Cards per league) and the rows to draw. */
  wcView: WcView | null = null;

  /** Seeds 1-6 per league from the current standings: the 3 division leaders (by record)
   *  followed by the 3 wild card teams (by wcRank). Only used to project the bracket
   *  before MLB has scheduled any postseason series. */
  alSeeds: TeamRow[] = [];
  nlSeeds: TeamRow[] = [];

  /** Postseason Bracket tab: built from MLB's postseason series feed for the selected season,
   *  so each year shows the teams and the format (rounds, best-of lengths, byes) that year used. */
  bracketModel: BracketModel | null = null;
  bracketLoading = false;
  bracketError = false;
  private bracketCache = new Map<number, BracketModel>();
  private teamInfo = new Map<number, TeamInfo>();
  private resolveTeam: TeamResolver;
  private bracketTimer: ReturnType<typeof setTimeout> | null = null;

  season = new Date().getFullYear();
  /** Years available in the season picker (descending). Standings begin in 1901 (modern AL/NL era). */
  readonly years: number[] = (() => {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now; y >= 1901; y--) out.push(y);
    return out;
  })();

  constructor(private api: MlbApiService, public teams: TeamDataService, private router: Router, private seo: SeoService) {
    this.resolveTeam = makeTeamResolver(this.teams);
  }

  ngOnInit() {
    this.seo.update(
      'MLB Standings — AL & NL Division and Wild Card Standings | Baseball Nerd',
      'Current MLB standings for the American and National League, updated daily with wins, losses, games behind, run differential, and separate wild card tracking.'
    );
    this.loadStandings();
  }

  ngOnDestroy() {
    this.stopBracketRefresh();
  }

  goToTeam(teamId: number) {
    if (teamId) this.router.navigate(['/team-schedule', teamId]);
  }

  setTab(tab: 'DIV' | 'WC' | 'BRACKET') {
    this.activeTab = tab;
    if (tab === 'BRACKET') this.loadBracket();
    else this.stopBracketRefresh();
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
    this.wcView = null;
    this.alSeeds = [];
    this.nlSeeds = [];
    this.bracketModel = null;
    this.bracketError = false;
    this.stopBracketRefresh();
    this.loadStandings();
  }

  trackByYear(_: number, y: number) { return y; }

  loadStandings() {
    this.loading = true;
    const season = this.season;
    this.api.getStandings(season).subscribe({
      next: (data) => {
        if (season !== this.season) return;
        const records = data.records || [];
        this.collectTeamInfo(records);
        this.buildDivisions(records);

        // Seasons without a Wild Card have nothing to fetch — the tab just says so.
        if (wildCardFormat(season).spots === 0) {
          this.wcView = buildWildCardView(season, records, null);
          this.loading = false;
          if (this.activeTab === 'BRACKET') this.loadBracket();
          return;
        }
        this.api.getWildCard(season).subscribe({
          next: (wc) => {
            if (season !== this.season) return;
            this.buildWildCard(wc.records || []);
            this.wcView = buildWildCardView(season, records, wc.records || []);
            this.alSeeds = this.buildBracketSeeds(this.alDivisionLeaders, this.alWildCard);
            this.nlSeeds = this.buildBracketSeeds(this.nlDivisionLeaders, this.nlWildCard);
            this.loading = false;
            if (this.activeTab === 'BRACKET') this.loadBracket();
          },
          error: () => {
            if (season !== this.season) return;
            this.wcView = buildWildCardView(season, records, null);
            this.loading = false;
            if (this.activeTab === 'BRACKET') this.loadBracket();
          }
        });
      },
      error: () => { if (season !== this.season) return; this.loading = false; if (this.activeTab === 'BRACKET') this.loadBracket(); }
    });
  }

  /** Per-team league / division rank / win% for the season — used to place teams in the bracket. */
  private collectTeamInfo(records: any[]) {
    const info = new Map<number, TeamInfo>();
    for (const rec of records) {
      const lg = rec.league?.id === 103 ? 'AL' : rec.league?.id === 104 ? 'NL' : null;
      for (const tr of rec.teamRecords || []) {
        const id = tr.team?.id;
        if (!id) continue;
        info.set(id, {
          league: lg,
          divisionRank: parseInt(tr.divisionRank, 10) || 0,
          pct: parseFloat(tr.winningPercentage) || 0
        });
      }
    }
    this.teamInfo = info;
  }

  /** (Re)loads the postseason series for the selected season and rebuilds the bracket. */
  loadBracket(force = false) {
    if (this.loading) return;   // called again as soon as the standings finish loading
    const season = this.season;
    const cached = this.bracketCache.get(season);
    if (cached && !force && !this.isInProgress(cached)) {
      this.bracketModel = cached;
      this.bracketError = false;
      return;
    }
    if (cached && !this.bracketModel) this.bracketModel = cached;
    if (!this.bracketModel) this.bracketLoading = true;
    this.bracketError = false;

    this.api.getPostseasonSeries(season).subscribe({
      next: (res) => {
        if (season !== this.season) return;
        const model = buildBracket({
          season,
          series: res?.series ?? [],
          info: this.teamInfo,
          resolve: this.resolveTeam,
          projected: this.projectedSeeds()
        });
        this.bracketCache.set(season, model);
        this.bracketModel = model;
        this.bracketLoading = false;
        this.scheduleBracketRefresh(model);
      },
      error: () => {
        if (season !== this.season) return;
        this.bracketLoading = false;
        this.bracketError = !this.bracketModel;   // a failed background refresh keeps the last bracket
      }
    });
  }

  /** True while the selected season's World Series hasn't been decided. */
  private isInProgress(model: BracketModel): boolean {
    return model.season >= new Date().getFullYear() && model.kind !== 'none' && model.roots.WS?.winner == null;
  }

  private scheduleBracketRefresh(model: BracketModel) {
    this.stopBracketRefresh();
    if (typeof window === 'undefined' || this.activeTab !== 'BRACKET' || !this.isInProgress(model)) return;
    this.bracketTimer = setTimeout(() => this.loadBracket(true), 60_000);
  }

  private stopBracketRefresh() {
    if (this.bracketTimer) { clearTimeout(this.bracketTimer); this.bracketTimer = null; }
  }

  private projectedSeeds(): ProjectedSeeds | null {
    if (this.alSeeds.length !== 6 || this.nlSeeds.length !== 6) return null;
    const conv = (rows: TeamRow[]) => rows.map(r => this.resolveTeam(r.teamId, r.teamName));
    return { AL: conv(this.alSeeds), NL: conv(this.nlSeeds) };
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

  isGbLeader(gb: string) { return gb === '-' || gb === '0.0' || gb === '0'; }
  logoError(ev: Event)   { (ev.target as HTMLImageElement).style.display = 'none'; }
}
