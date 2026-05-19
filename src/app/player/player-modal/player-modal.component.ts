import { Component, OnInit, OnDestroy, HostListener, Renderer2, Inject, ChangeDetectorRef } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PlayerService } from '../../shared/player.service';
import { MlbApiService } from '../../shared/mlb-api.service';
import { TeamDataService } from '../../shared/team-data.service';
import { catchError, of } from 'rxjs';

export interface StatDef { label: string; key: string; fmt?: 'rate' | 'int' | 'str'; }

const HIT_STANDARD: StatDef[] = [
  { label: 'G',    key: 'gamesPlayed',         fmt: 'int' },
  { label: 'PA',   key: 'plateAppearances',     fmt: 'int' },
  { label: 'AB',   key: 'atBats',               fmt: 'int' },
  { label: 'R',    key: 'runs',                 fmt: 'int' },
  { label: 'H',    key: 'hits',                 fmt: 'int' },
  { label: '2B',   key: 'doubles',              fmt: 'int' },
  { label: '3B',   key: 'triples',              fmt: 'int' },
  { label: 'HR',   key: 'homeRuns',             fmt: 'int' },
  { label: 'RBI',  key: 'rbi',                  fmt: 'int' },
  { label: 'SB',   key: 'stolenBases',          fmt: 'int' },
  { label: 'CS',   key: 'caughtStealing',       fmt: 'int' },
  { label: 'BB',   key: 'baseOnBalls',          fmt: 'int' },
  { label: 'IBB',  key: 'intentionalWalks',     fmt: 'int' },
  { label: 'SO',   key: 'strikeOuts',           fmt: 'int' },
  { label: 'HBP',  key: 'hitByPitch',           fmt: 'int' },
  { label: 'SAC',  key: 'sacBunts',             fmt: 'int' },
  { label: 'SF',   key: 'sacFlies',             fmt: 'int' },
  { label: 'TB',   key: 'totalBases',           fmt: 'int' },
  { label: 'GDP',  key: 'groundIntoDoublePlay', fmt: 'int' },
  { label: 'LOB',  key: 'leftOnBase',           fmt: 'int' },
];

const HIT_RATE: StatDef[] = [
  { label: 'AVG',   key: 'avg',   fmt: 'rate' },
  { label: 'OBP',   key: 'obp',   fmt: 'rate' },
  { label: 'SLG',   key: 'slg',   fmt: 'rate' },
  { label: 'OPS',   key: 'ops',   fmt: 'rate' },
  { label: 'BABIP', key: 'babip', fmt: 'rate' },
];

const PIT_STANDARD: StatDef[] = [
  { label: 'G',    key: 'gamesPitched',      fmt: 'int' },
  { label: 'GS',   key: 'gamesStarted',      fmt: 'int' },
  { label: 'W',    key: 'wins',              fmt: 'int' },
  { label: 'L',    key: 'losses',            fmt: 'int' },
  { label: 'SV',   key: 'saves',             fmt: 'int' },
  { label: 'SVO',  key: 'saveOpportunities', fmt: 'int' },
  { label: 'HLD',  key: 'holds',             fmt: 'int' },
  { label: 'BS',   key: 'blownSaves',        fmt: 'int' },
  { label: 'CG',   key: 'completeGames',     fmt: 'int' },
  { label: 'SHO',  key: 'shutouts',          fmt: 'int' },
  { label: 'QS',   key: 'qualityStarts',     fmt: 'int' },
  { label: 'IP',   key: 'inningsPitched',    fmt: 'str' },
];

const PIT_OPPONENTS: StatDef[] = [
  { label: 'H',    key: 'hits',              fmt: 'int' },
  { label: 'R',    key: 'runs',              fmt: 'int' },
  { label: 'ER',   key: 'earnedRuns',        fmt: 'int' },
  { label: 'HR',   key: 'homeRuns',          fmt: 'int' },
  { label: 'BB',   key: 'baseOnBalls',       fmt: 'int' },
  { label: 'IBB',  key: 'intentionalWalks',  fmt: 'int' },
  { label: 'SO',   key: 'strikeOuts',        fmt: 'int' },
  { label: 'HBP',  key: 'hitBatsmen',        fmt: 'int' },
  { label: 'BK',   key: 'balks',             fmt: 'int' },
  { label: 'WP',   key: 'wildPitches',       fmt: 'int' },
  { label: 'P',    key: 'numberOfPitches',   fmt: 'int' },
];

const PIT_RATE: StatDef[] = [
  { label: 'ERA',   key: 'era',                   fmt: 'rate' },
  { label: 'WHIP',  key: 'whip',                  fmt: 'rate' },
  { label: 'K/9',   key: 'strikeoutsPer9Inn',      fmt: 'rate' },
  { label: 'BB/9',  key: 'walksPer9Inn',           fmt: 'rate' },
  { label: 'H/9',   key: 'hitsPer9Inn',            fmt: 'rate' },
  { label: 'K/BB',  key: 'strikeoutWalkRatio',     fmt: 'rate' },
  { label: 'AVG',   key: 'avg',                    fmt: 'rate' },
];

@Component({
  selector: 'app-player-modal',
  templateUrl: './player-modal.component.html',
  styleUrl: './player-modal.component.scss',
  standalone: false
})
export class PlayerModalComponent implements OnInit, OnDestroy {
  player: any = null;
  playerId: number | null = null;
  loading = false;
  error = false;

  // Group / view tabs
  activeGroup: 'hitting' | 'pitching' = 'hitting';
  activeView: 'season' | 'career' | 'gamelog' = 'season';

  // Year selection
  selectedYear: number = new Date().getFullYear();
  currentYear: number = new Date().getFullYear();
  availableYears: number[] = [];

  // Year-specific stats (null = use current season from person)
  yearStats: any = null;
  loadingYearStats = false;

  // Game log
  gameLogs: any[] = [];
  loadingGameLog = false;

  // Exposed stat definitions for template
  readonly hitStandard = HIT_STANDARD;
  readonly hitRate     = HIT_RATE;
  readonly pitStandard = PIT_STANDARD;
  readonly pitOpponents = PIT_OPPONENTS;
  readonly pitRate     = PIT_RATE;

  constructor(
    private playerSvc: PlayerService,
    private api: MlbApiService,
    public teams: TeamDataService,
    private renderer: Renderer2,
    private cdr: ChangeDetectorRef,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit() {
    this.playerSvc.openPlayer$.subscribe(id => {
      this.load(id);
      this.renderer.addClass(this.document.body, 'modal-open');
    });
  }

  ngOnDestroy() {
    this.renderer.removeClass(this.document.body, 'modal-open');
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.close(); }

  load(id: number) {
    this.playerId = id;
    this.loading = true;
    this.error = false;
    this.player = null;
    this.yearStats = null;
    this.gameLogs = [];
    this.selectedYear = this.currentYear;

    this.api.getPerson(id).subscribe({
      next: (data) => {
        this.player = data.people?.[0] ?? null;
        this.buildAvailableYears();
        this.setDefaultGroup();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.error = true; this.loading = false; this.cdr.markForCheck(); }
    });
  }

  private buildAvailableYears() {
    if (!this.player?.stats) return;
    const yearByYearSplits: any[] = [];

    for (const s of this.player.stats) {
      if (s.type?.displayName === 'yearByYear' || s.type?.displayName === 'yearByYearPlayoffs') continue;
      if (s.type?.displayName !== 'yearByYear') {
        // collect from any yearByYear block
      }
    }

    // Find yearByYear entries for either group
    const ybyEntry = this.player.stats.find((s: any) =>
      s.type?.displayName === 'yearByYear'
    );

    const years = new Set<number>();
    if (ybyEntry?.splits) {
      for (const split of ybyEntry.splits) {
        const yr = parseInt(split.season ?? split.year, 10);
        if (!isNaN(yr)) years.add(yr);
      }
    }

    // Also try hitting/pitching yearByYear
    for (const s of this.player.stats) {
      if (s.type?.displayName === 'yearByYear' && s.splits) {
        for (const split of s.splits) {
          const yr = parseInt(split.season ?? split.year, 10);
          if (!isNaN(yr)) years.add(yr);
        }
      }
    }

    this.availableYears = Array.from(years).sort((a, b) => b - a);
    if (!this.availableYears.includes(this.currentYear)) {
      this.availableYears.unshift(this.currentYear);
    }
    if (this.availableYears.length === 0) {
      this.availableYears = [this.currentYear];
    }
  }

  private setDefaultGroup() {
    if (!this.player) return;
    this.activeGroup = this.isPitcher ? 'pitching' : 'hitting';
    this.activeView = 'season';
  }

  selectYear(year: number) {
    if (this.selectedYear === year) return;
    this.selectedYear = year;
    this.yearStats = null;
    this.gameLogs = [];

    if (year !== this.currentYear) {
      this.loadYearStats(year);
    }
    // If viewing gamelog, reload it for new year
    if (this.activeView === 'gamelog') {
      this.loadGameLog();
    }
  }

  selectView(view: 'season' | 'career' | 'gamelog') {
    this.activeView = view;
    if (view === 'gamelog' && this.gameLogs.length === 0 && !this.loadingGameLog) {
      this.loadGameLog();
    }
  }

  private loadYearStats(year: number) {
    if (!this.playerId) return;
    this.loadingYearStats = true;
    this.api.getPlayerStatsBySeason(this.playerId, year).pipe(catchError(() => of(null)))
      .subscribe(data => {
        this.yearStats = data?.stats ?? null;
        this.loadingYearStats = false;
        this.cdr.markForCheck();
      });
  }

  private loadGameLog() {
    if (!this.playerId) return;
    this.loadingGameLog = true;
    this.gameLogs = [];
    const group = this.activeGroup;
    this.api.getPlayerGameLog(this.playerId, group, this.selectedYear)
      .pipe(catchError(() => of(null)))
      .subscribe(data => {
        const splits = data?.stats?.[0]?.splits ?? [];
        // Reverse so most recent game is first
        this.gameLogs = [...splits].reverse();
        this.loadingGameLog = false;
        this.cdr.markForCheck();
      });
  }

  /** Get a season stat value — from yearStats (if a past year is selected) or from main player object */
  getSeasonStat(group: string, key: string): any {
    // If viewing a past year, use yearStats
    if (this.selectedYear !== this.currentYear && this.yearStats) {
      const entry = this.yearStats.find((s: any) =>
        s.group?.displayName?.toLowerCase() === group ||
        s.group?.displayName?.toLowerCase().includes(group)
      );
      const val = entry?.splits?.[0]?.stat?.[key];
      return val ?? '—';
    }
    // Current year from main player object
    const entry = this.player?.stats?.find((s: any) =>
      (s.type?.displayName === 'season' || s.type?.displayName === 'statsSingleSeason') &&
      (s.group?.displayName?.toLowerCase() === group || s.group?.displayName?.toLowerCase().includes(group))
    );
    const val = entry?.splits?.[0]?.stat?.[key];
    return val ?? '—';
  }

  /** Get a career stat value */
  getCareerStat(group: string, key: string): any {
    const entry = this.player?.stats?.find((s: any) =>
      (s.type?.displayName === 'career' || s.type?.displayName === 'careerRegularSeason') &&
      (s.group?.displayName?.toLowerCase() === group || s.group?.displayName?.toLowerCase().includes(group))
    );
    const val = entry?.splits?.[0]?.stat?.[key];
    return val ?? '—';
  }

  get teamId()   { return this.player?.currentTeam?.id; }
  get isPitcher() { return this.player?.primaryPosition?.code === '1'; }

  get hasHitting()  {
    return !!this.player?.stats?.find((s: any) =>
      s.group?.displayName?.toLowerCase() === 'hitting' && s.splits?.length
    );
  }
  get hasPitching() {
    return !!this.player?.stats?.find((s: any) =>
      s.group?.displayName?.toLowerCase() === 'pitching' && s.splits?.length
    );
  }

  get birthDateFormatted() {
    if (!this.player?.birthDate) return '';
    return new Date(this.player.birthDate + 'T00:00:00').toLocaleDateString([], {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  formatGameDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  trackByYear(_: number, y: number) { return y; }
  trackByLog(_: number, log: any) { return log.game?.gamePk ?? _; }
  trackByStat(_: number, s: StatDef) { return s.key; }

  photoError(ev: Event) { (ev.target as HTMLImageElement).style.opacity = '0'; }
  logoError(ev: Event)  { (ev.target as HTMLImageElement).style.display = 'none'; }

  close() {
    this.player = null;
    this.loading = false;
    this.yearStats = null;
    this.gameLogs = [];
    this.renderer.removeClass(this.document.body, 'modal-open');
  }

  closeOnOverlay(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.close();
  }
}