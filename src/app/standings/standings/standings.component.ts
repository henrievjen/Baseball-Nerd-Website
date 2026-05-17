import { Component, OnInit } from '@angular/core';
import { MlbApiService } from '../../shared/mlb-api.service';
import { TeamDataService } from '../../shared/team-data.service';

interface TeamRow {
  teamId: number; teamName: string;
  wins: number; losses: number; pct: string;
  gb: string; wcGb?: string; rank: number; wcRank?: number;
  divisionLeader?: boolean;
}

interface Division {
  name: string; shortName: string; teams: TeamRow[];
}

@Component({
  selector: 'app-standings',
  templateUrl: './standings.component.html',
  styleUrls: ['./standings.component.scss']
})
export class StandingsComponent implements OnInit {
  activeTab: 'DIV' | 'WC' = 'DIV';
  loading = true;

  alDivisions: Division[] = [];
  nlDivisions: Division[] = [];
  alWildCard: TeamRow[] = [];
  nlWildCard: TeamRow[] = [];

  season = new Date().getFullYear();

  constructor(private api: MlbApiService, public teams: TeamDataService) {}

  ngOnInit() { this.loadStandings(); }

  loadStandings() {
    this.loading = true;
    this.api.getStandings(this.season).subscribe({
      next: (data) => {
        this.buildDivisions(data.records || []);
        this.api.getWildCard(this.season).subscribe({
          next: (wc) => { this.buildWildCard(wc.records || []); this.loading = false; },
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

  isGbLeader(gb: string) { return gb === '-' || gb === '0.0' || gb === '0'; }
  logoError(ev: Event)   { (ev.target as HTMLImageElement).style.display = 'none'; }
}
