import { Component, OnInit, OnDestroy } from '@angular/core';
import { MlbApiService } from '../../shared/mlb-api.service';
import { TeamDataService } from '../../shared/team-data.service';
import { PlayerService } from '../../shared/player.service';
import { Subscription } from 'rxjs';

interface StatCat { label: string; key: string; group: string; }
interface CatGroup { group: string; cats: StatCat[]; }

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
  standalone: false
})
export class StatsComponent implements OnInit, OnDestroy {
  season = new Date().getFullYear();
  years: number[] = [];
  /** Selected team filter (0 = all MLB) */
  teamId = 0;
  teamList: Array<{ id: number; name: string; abbr: string }> = [];
  loading = false; // Tracks if 200ms have elapsed
  isFetching = false; // Tracks if a request is in flight
  leaders: any[] = [];
  cache: Record<string, any[]> = {};

  private loadingTimeout: any;
  private sub?: Subscription;

  activeCat: StatCat = { label: 'AVG', key: 'avg', group: 'hitting' };

  catGroups: CatGroup[] = [
    { group: 'HITTING', cats: [
      { label: 'AVG',  key: 'avg',                group: 'hitting' },
      { label: 'HR',   key: 'homeRuns',           group: 'hitting' },
      { label: 'RBI',  key: 'runsBattedIn',       group: 'hitting' },
      { label: 'OPS',  key: 'onBasePlusSlugging', group: 'hitting' },
      { label: 'Hits', key: 'hits',               group: 'hitting' },
      { label: 'SB',   key: 'stolenBases',        group: 'hitting' },
    ]},
    { group: 'PITCHING', cats: [
      { label: 'ERA',  key: 'earnedRunAverage',   group: 'pitching' },
      { label: 'Wins', key: 'wins',               group: 'pitching' },
      { label: 'K',    key: 'strikeOuts',         group: 'pitching' },
      { label: 'WHIP', key: 'whip',               group: 'pitching' },
      { label: 'SV',   key: 'saves',              group: 'pitching' },
    ]}
  ];

  constructor(
    private api: MlbApiService,
    public teams: TeamDataService,
    private playerSvc: PlayerService
  ) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1900; y--) {
      this.years.push(y);
    }
    this.teamList = this.teams.allTeams();
  }

  ngOnInit() { this.loadCat(this.activeCat); }

  ngOnDestroy() {
    this.cleanup();
  }

  private cleanup() {
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
    if (this.sub) this.sub.unsubscribe();
  }

  selectCat(cat: StatCat) { this.activeCat = cat; this.loadCat(cat); }

  onSeasonChange(event: any) {
    this.season = parseInt(event.target.value, 10);
    this.loadCat(this.activeCat);
  }

  onTeamChange(event: any) {
    this.teamId = parseInt(event.target.value, 10) || 0;
    this.loadCat(this.activeCat);
  }

  loadCat(cat: StatCat) {
    const key = `${cat.key}-${this.season}-${this.teamId}`;

    this.cleanup();
    this.loading = false;
    this.leaders = [];

    if (this.cache[key]) {
      this.leaders = this.cache[key];
      this.isFetching = false;
      this.loading = true; // Results available immediately
      return;
    }

    this.isFetching = true;
    this.loadingTimeout = setTimeout(() => {
      this.loading = true;
    }, 200);

    this.sub = this.api.getStatsLeaders(cat.key, cat.group, this.season, this.teamId || undefined).subscribe({
      next: (data) => {
        const list = (data.leagueLeaders ?? []).flatMap((l: any) => l.leaders ?? []);
        this.cache[key] = list;
        this.leaders = list;
        this.isFetching = false;

        if (list.length > 0) {
          // Data found, show it immediately and cancel the delay
          if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
          this.loading = true;
        }
        // If empty, let the timeout fire to show the empty state after 200ms
      },
      error: () => {
        this.isFetching = false;
        // Let timeout fire to show empty state/error
      }
    });
  }

  openPlayer(personId: number) { if (personId) this.playerSvc.openPlayer(personId); }
  photoError(ev: Event)        { (ev.target as HTMLImageElement).style.opacity = '0'; }
  logoError(ev: Event)         { (ev.target as HTMLImageElement).style.display = 'none'; }
}
