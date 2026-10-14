import {AfterViewInit, Component, HostListener, Inject, OnDestroy, OnInit, PLATFORM_ID} from "@angular/core";
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MlbApiService } from '../../shared/mlb-api.service';
import { LeagueScoresService, LeagueGamesResult } from '../../shared/league-scores.service';
import { LEAGUES, DEFAULT_LEAGUE_IDS, LeagueDef, LeagueGroup, leagueById, leagueGroups, sanitizeLeagueIds } from '../../shared/leagues';
import { FavoriteTeamsService } from '../../shared/favorite-teams.service';
import { SeoService } from '../../shared/seo.service';
import { Subscription, timer, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';

const LEAGUES_STORAGE_KEY = 'bn.scoreLeagues';

export interface DateTab {
  date: Date;
  dateStr: string;
  label: string;
  shortDate: string;
}

export interface CalendarDay {
  date: Date | null;
  dateStr: string;
  day: number;
  isToday: boolean;
  isSelected: boolean;
  isOtherMonth: boolean;
}

/** One league's games on the selected date, rendered as its own block. */
export interface LeagueSection {
  league: LeagueDef;
  games: any[];
  liveCount: number;
}

@Component({
  selector: 'app-scores',
  templateUrl: './scores.component.html',
  styleUrl: './scores.component.scss',
  standalone: false
})
export class ScoresComponent implements OnInit, OnDestroy, AfterViewInit {
  dateTabs: DateTab[] = [];
  activeDateIdx = 0;
  games: any[] = [];

  // ── League selection ─────────────────────────────────
  readonly leagueGroups: LeagueGroup[] = leagueGroups();
  selectedLeagueIds: string[] = [...DEFAULT_LEAGUE_IDS];
  leagueSections: LeagueSection[] = [];
  /** Leagues whose last request failed (their previous games are kept on screen). */
  failedLeagueIds: string[] = [];
  private leagueCounts: Record<string, number> = {};

  loading = false;
  selectedGame: any = null;
  boxscore: any = null;
  loadingDetail = false;
  plays: any = null;
  loadingPlays = false;
  liveFeed: any = null;
  makeupGame: any = null;

  // ── Custom calendar ──────────────────────────────────
  calendarOpen = false;
  calendarYear  = new Date().getFullYear();
  calendarMonth = new Date().getMonth();   // 0-based
  calendarDays: CalendarDay[] = [];

  private readonly MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  private readonly DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  get calendarMonthLabel(): string {
    return `${this.MONTH_NAMES[this.calendarMonth]} ${this.calendarYear}`;
  }
  get dayLabels(): string[] { return this.DAY_LABELS; }

  toggleCalendar() {
    this.calendarOpen = !this.calendarOpen;
    if (this.calendarOpen) this.syncCalendarToActive();
  }

  private syncCalendarToActive() {
    const active = this.dateTabs[this.activeDateIdx]?.date ?? new Date();
    this.calendarYear  = active.getFullYear();
    this.calendarMonth = active.getMonth();
    this.buildCalendarGrid();
  }

  prevMonth() {
    if (this.calendarMonth === 0) { this.calendarMonth = 11; this.calendarYear--; }
    else this.calendarMonth--;
    this.buildCalendarGrid();
  }

  nextMonth() {
    if (this.calendarMonth === 11) { this.calendarMonth = 0; this.calendarYear++; }
    else this.calendarMonth++;
    this.buildCalendarGrid();
  }

  buildCalendarGrid() {
    const today = new Date(); today.setHours(0,0,0,0);
    const activeStr = this.dateTabs[this.activeDateIdx]?.dateStr ?? '';

    const firstDay  = new Date(this.calendarYear, this.calendarMonth, 1);
    const lastDay   = new Date(this.calendarYear, this.calendarMonth + 1, 0);
    const startDow  = firstDay.getDay();   // 0=Sun

    const days: CalendarDay[] = [];

    // Leading padding from previous month
    for (let i = 0; i < startDow; i++) {
      const d = new Date(this.calendarYear, this.calendarMonth, 1 - (startDow - i));
      const ds = this.toDateStr(d);
      days.push({ date: d, dateStr: ds, day: d.getDate(),
        isToday: d.getTime()===today.getTime(), isSelected: ds===activeStr, isOtherMonth: true });
    }

    // Current month
    for (let n = 1; n <= lastDay.getDate(); n++) {
      const d = new Date(this.calendarYear, this.calendarMonth, n);
      const ds = this.toDateStr(d);
      days.push({ date: d, dateStr: ds, day: n,
        isToday: d.getTime()===today.getTime(), isSelected: ds===activeStr, isOtherMonth: false });
    }

    // Trailing padding to fill last row
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(this.calendarYear, this.calendarMonth + 1, i);
      const ds = this.toDateStr(d);
      days.push({ date: d, dateStr: ds, day: i,
        isToday: d.getTime()===today.getTime(), isSelected: ds===activeStr, isOtherMonth: true });
    }

    this.calendarDays = days;
  }

  selectCalendarDay(day: CalendarDay) {
    if (!day.date) return;
    this.calendarOpen = false;
    const existingIdx = this.dateTabs.findIndex(t => t.dateStr === day.dateStr);
    if (existingIdx !== -1) {
      this.selectDate(existingIdx);
    } else {
      this.buildDateTabs(day.date);
      this.startPolling(true);
      this.centerActiveTab('auto');
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent) {
    if (!this.calendarOpen) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.calendar-picker')) this.calendarOpen = false;
  }

  private pollSub?: Subscription;
  private detailPollSub?: Subscription;
  private favSub?: Subscription;
  private daysNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  private monthsNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  private readonly isBrowser: boolean;

  constructor(
    private api: MlbApiService,
    private leagueScores: LeagueScoresService,
    private route: ActivatedRoute,
    public favorites: FavoriteTeamsService,
    private seo: SeoService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  private pendingGamePk?: number;

  ngOnInit() {
    this.seo.update(
      "Today's MLB Scores & Live Box Scores | Baseball Nerd",
      "Live MLB scores for today's games with inning-by-inning updates, starting pitcher matchups, and final results, sourced directly from the official MLB Stats API."
    );

    if (!this.isBrowser) {
      // Live scores are the most time-sensitive content on the site, and
      // this page is prerendered ONCE at build time, then served
      // unchanged to every visitor until the next manual deploy. "Today"
      // and "live" only mean something relative to when someone actually
      // opens the page — baking in whatever game data happened to be
      // current at build time risks showing a real visitor, hours or
      // days later, a frozen, unrelated game's score under today's date.
      // Render an honest loading shell here; the browser branch below
      // does the real fetch immediately on hydration.
      this.loading = true;
      return;
    }

    const qp = this.route.snapshot.queryParamMap;
    const dateStr = qp.get('date');
    const gp = qp.get('gamePk');
    if (gp) this.pendingGamePk = Number(gp);

    // ?leagues=mlb,afl wins, then the visitor's last choice. A bare ?gamePk=
    // link predates multi-league and always means an MLB game.
    const leaguesParam = qp.get('leagues');
    if (leaguesParam) {
      this.selectedLeagueIds = sanitizeLeagueIds(leaguesParam.split(','));
    } else if (gp) {
      this.selectedLeagueIds = [...DEFAULT_LEAGUE_IDS];
    } else {
      this.selectedLeagueIds = sanitizeLeagueIds(this.loadStoredLeagues());
    }

    if (dateStr) {
      const [y, m, d] = dateStr.split('-').map(Number);
      this.buildDateTabs(new Date(y, m - 1, d));
    } else {
      this.buildDateTabs();
    }
    this.startPolling(true);

    this.favSub = this.favorites.favorites$.subscribe(() => {
      if (this.games?.length) this.games = this.sortGamesByFavorite(this.games);
    });
  }

  ngAfterViewInit() {
    this.centerActiveTab('auto');
  }

  ngOnDestroy() {
    this.stopPolling();
    this.stopDetailPolling();
    this.favSub?.unsubscribe();
  }

  buildDateTabs(baseDate: Date = new Date()) {
    const centerDate = new Date(baseDate);
    centerDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOffset = -30;
    const totalDays = 150;

    this.dateTabs = Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(centerDate);
      d.setDate(centerDate.getDate() + startOffset + i);

      const isToday = d.getTime() === today.getTime();
      return {
        date: d,
        dateStr: this.toDateStr(d),
        label: isToday ? 'Today' : this.daysNames[d.getDay()],
        shortDate: `${this.monthsNames[d.getMonth()]} ${d.getDate()}`
      };
    });

    this.activeDateIdx = Math.abs(startOffset);
  }

  private centerActiveTab(behavior: 'auto' | 'smooth' = 'smooth') {
    if (!this.isBrowser) return;
    setTimeout(() => {
      const activeEl = document.querySelector('.date-tab.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: behavior as ScrollBehavior, inline: 'center', block: 'nearest' });
      }
    }, 250);
  }

  toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  selectDate(idx: number) {
    if (this.activeDateIdx === idx) return;
    this.activeDateIdx = idx;
    this.startPolling(true);
    this.centerActiveTab('smooth');
    if (this.calendarOpen) this.buildCalendarGrid();
  }

  get isOnToday(): boolean {
    const sel = this.dateTabs[this.activeDateIdx]?.date;
    if (!sel) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const s = new Date(sel);  s.setHours(0, 0, 0, 0);
    return s.getTime() === today.getTime();
  }

  goToToday() {
    if (this.isOnToday) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIdx = this.dateTabs.findIndex(t => {
      const d = new Date(t.date); d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });
    if (todayIdx !== -1) {
      this.selectDate(todayIdx);
    } else {
      this.buildDateTabs(today);
      this.startPolling(true);
      this.centerActiveTab('auto');
    }
  }

  onCalendarDateChange(event: any) {
    const val = event.target?.value;
    if (!val) return;
    const [y, m, d] = val.split('-').map(Number);
    const selectedDate = new Date(y, m - 1, d);
    selectedDate.setHours(0, 0, 0, 0);
    const existingIdx = this.dateTabs.findIndex(t => t.dateStr === val);
    if (existingIdx !== -1) { this.selectDate(existingIdx); }
    else { this.buildDateTabs(selectedDate); this.startPolling(true); this.centerActiveTab('auto'); }
  }

  startPolling(initial: boolean = false) {
    // ngOnInit only ever calls this in the browser now (see ngOnInit) — the
    // scores page no longer fetches or bakes in game data during
    // prerendering at all, so there's no server branch to handle here
    // anymore. Kept as a plain assertion rather than silently trusting
    // the caller, in case that ever changes.
    if (!this.isBrowser) return;

    this.stopPolling();
    if (initial) { this.loading = true; this.games = []; }

    const selectedDate = this.dateTabs[this.activeDateIdx].date;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isToday = selectedDate.getTime() === today.getTime();
    // MLB-only keeps the original 15s cadence. Every extra league is another
    // request per poll, so multi-league views refresh a little less often.
    const mlbOnly = this.selectedLeagueIds.length === 1 && this.selectedLeagueIds[0] === 'mlb';
    const interval = isToday ? (mlbOnly ? 15000 : 20000) : 300000;

    const leagueIds = [...this.selectedLeagueIds];
    const fetchOnce = () => {
      const tab = this.dateTabs[this.activeDateIdx];
      return this.leagueScores.getGames(leagueIds, tab.dateStr).pipe(
        catchError(() => of<LeagueGamesResult>({ games: [], failed: leagueIds }))
      );
    };

    this.pollSub = timer(0, interval).pipe(
      switchMap(fetchOnce)
    ).subscribe({
      next: (res) => {
        // A league that failed this round keeps whatever it showed last time,
        // instead of blanking out on one bad request.
        const kept = res.failed.length ? this.games.filter(g => res.failed.includes(g._leagueId)) : [];
        this.failedLeagueIds = res.failed;
        this.updateGames([...res.games, ...kept]);
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private updateGames(newGames: any[]) {
    // Deduplicate: the MLB API includes the original postponed game entry on its
    // rescheduled date alongside the real makeup game. Drop the postponed ghost.
    // Use codedGameState 'D' to identify the original postponed entry — this is
    // the only reliable signal. Do NOT filter on detailedState 'Rescheduled'
    // because the MLB API also sets that on the makeup game itself.
    const isOriginalPostponed = (g: any) => g.status?.codedGameState === 'D';

    const activePairs = new Set<string>();
    for (const g of newGames) {
      if (isOriginalPostponed(g)) continue;
      activePairs.add(`${g.teams.away.team.id}-${g.teams.home.team.id}`);
    }

    const filteredGames = newGames.filter(g => {
      if (!isOriginalPostponed(g)) return true;
      const key = `${g.teams.away.team.id}-${g.teams.home.team.id}`;
      return !activePairs.has(key);
    });

    this.games = this.sortGamesByFavorite(filteredGames);
    this.rebuildSections();

    if (this.selectedGame) {
      const updated = this.findBestGameMatch(this.selectedGame, newGames);
      if (updated) {
        this.selectedGame = updated;
      }
    }

    if (this.pendingGamePk && !this.selectedGame) {
      const match = newGames.find(g => g.gamePk === this.pendingGamePk);
      if (match) {
        this.pendingGamePk = undefined;
        this.openGame(match);
        // Scores now lives at "/", not "/scores" — read the actual current
        // path instead of hardcoding the old one, so this doesn't silently
        // rewrite the address bar to a URL that just redirects right back.
        // Browser-only: `history`/`window` don't exist during prerendering
        // (this branch is unreachable there anyway, since prerendering never
        // visits a route with a gamePk query param, but guard it regardless).
        if (this.isBrowser) {
          this.syncUrl(true);
        }
      }
    }
  }

  private findBestGameMatch(current: any, list: any[]): any {
    const isPostponed = (g: any) => g.status?.codedGameState === 'D';

    // 1. Try exact PK match first
    const matches = list.filter(g => g.gamePk === current.gamePk);
    if (matches.length > 0) {
      // Prefer a non-postponed version if one exists
      const activeMatch = matches.find(m =>
        m.status?.abstractGameState !== 'Preview' && !isPostponed(m)
      );
      if (activeMatch) return activeMatch;
      return matches[0];
    }

    // 2. If PK not found, search by teams — prefer non-postponed Live/Final game.
    const nonPostponed = list.find(g =>
      g.teams.away.team.id === current.teams.away.team.id &&
      g.teams.home.team.id === current.teams.home.team.id &&
      g.status?.abstractGameState !== 'Preview' &&
      !isPostponed(g)
    );
    if (nonPostponed) return nonPostponed;

    const matchupMatch = list.find(g =>
      g.teams.away.team.id === current.teams.away.team.id &&
      g.teams.home.team.id === current.teams.home.team.id &&
      g.status?.abstractGameState !== 'Preview'
    );

    return matchupMatch || null;
  }

  private startDetailPolling() {
    this.stopDetailPolling();
    if (!this.selectedGame) return;

    const isLive = this.selectedGame.status?.abstractGameState === 'Live';
    const interval = isLive ? 8000 : 30000;

    this.detailPollSub = timer(0, interval).subscribe(() => {
      this.refreshSelectedGame();
    });
  }

  private stopDetailPolling() {
    if (this.detailPollSub) {
      this.detailPollSub.unsubscribe();
      this.detailPollSub = undefined;
    }
  }

  private refreshSelectedGame() {
    if (!this.selectedGame) return;

    const tab = this.dateTabs[this.activeDateIdx];
    // Fetch the full day's schedule rather than by gamePk alone — querying by
    // gamePk can return the original postponed entry instead of the makeup game.
    // Only the open game's own league is requested.
    const leagueId = this.selectedGame._leagueId ?? 'mlb';
    this.leagueScores.getGames([leagueId], tab.dateStr)
      .pipe(catchError(() => of(null)))
      .subscribe(data => {
        const allGames = data?.games ?? [];
        // First try exact PK match among non-postponed games
        const updated = this.findBestGameMatch(this.selectedGame, allGames);
        if (updated) {
          this.selectedGame = updated;
        }
      });

    this.api.getBoxscore(this.selectedGame.gamePk).pipe(catchError(() => of(null)))
      .subscribe({ next: (bs) => { if (bs) this.boxscore = bs; } });
    this.api.getPlayByPlay(this.selectedGame.gamePk).pipe(catchError(() => of(null)))
      .subscribe({ next: (p) => { if (p) this.plays = p; } });

    if (this.selectedGame.status?.abstractGameState === 'Live' ||
        this.selectedGame.status?.abstractGameState === 'Final') {
      this.api.getLiveFeed(this.selectedGame.gamePk).pipe(catchError(() => of(null)))
        .subscribe({ next: (lf) => { if (lf) this.liveFeed = lf; } });
    }
  }

  stopPolling() {
    if (this.pollSub) { this.pollSub.unsubscribe(); this.pollSub = undefined; }
  }

  trackByGamePk(_index: number, game: any) { return game.gamePk; }
  trackBySection(_index: number, section: LeagueSection) { return section.league.id; }

  // ── League selection ─────────────────────────────────

  isLeagueSelected(id: string): boolean { return this.selectedLeagueIds.includes(id); }

  get allLeaguesSelected(): boolean { return this.selectedLeagueIds.length === LEAGUES.length; }

  /** Section headers only earn their space when more than one league is on screen. */
  get showLeagueHeaders(): boolean { return this.selectedLeagueIds.length > 1; }

  get selectedLeagueNames(): string {
    return this.selectedLeagueIds.map(id => leagueById(id)?.short ?? id).join(', ');
  }

  get failedLeagueNames(): string {
    return this.failedLeagueIds.map(id => leagueById(id)?.short ?? id).join(', ');
  }

  /** Games on the selected date for a chip — only known for leagues that are on and loaded. */
  chipCount(id: string): number | null {
    if (this.loading || !this.isLeagueSelected(id)) return null;
    return this.leagueCounts[id] ?? 0;
  }

  toggleLeague(id: string) {
    if (this.isLeagueSelected(id)) {
      // Always keep at least one league on.
      if (this.selectedLeagueIds.length === 1) return;
      this.setLeagues(this.selectedLeagueIds.filter(x => x !== id));
    } else {
      this.setLeagues([...this.selectedLeagueIds, id]);
    }
  }

  /** "All" turns every league on; pressing it again drops back to MLB only. */
  toggleAllLeagues() {
    this.setLeagues(this.allLeaguesSelected ? [...DEFAULT_LEAGUE_IDS] : LEAGUES.map(l => l.id));
  }

  private setLeagues(ids: string[]) {
    const next = sanitizeLeagueIds(ids);
    if (next.length === this.selectedLeagueIds.length && next.every((id, i) => id === this.selectedLeagueIds[i])) return;

    this.selectedLeagueIds = next;
    this.failedLeagueIds = [];
    this.persistLeagues();
    this.syncUrl();
    if (this.selectedGame && !next.includes(this.selectedGame._leagueId ?? 'mlb')) this.closeGame();
    this.startPolling(true);
  }

  private rebuildSections() {
    const isLive = (g: any) => g?.status?.abstractGameState === 'Live' && g?.status?.detailedState !== 'Warmup';
    const counts: Record<string, number> = {};
    const sections: LeagueSection[] = [];

    for (const id of this.selectedLeagueIds) {
      const league = leagueById(id);
      if (!league) continue;
      const games = this.games.filter(g => g._leagueId === id);
      counts[id] = games.length;
      if (games.length) sections.push({ league, games, liveCount: games.filter(isLive).length });
    }
    this.leagueCounts = counts;
    this.leagueSections = sections;
  }

  private loadStoredLeagues(): string[] | null {
    try {
      const raw = localStorage.getItem(LEAGUES_STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      return Array.isArray(arr) ? arr.filter((x: any) => typeof x === 'string') : null;
    } catch { return null; }
  }

  private persistLeagues() {
    try { localStorage.setItem(LEAGUES_STORAGE_KEY, JSON.stringify(this.selectedLeagueIds)); }
    catch { /* private mode / quota — the selection just won't be remembered */ }
  }

  /**
   * Mirrors the selection into the address bar (?leagues=mlb,afl) so a view can
   * be shared. `dropDeepLinkParams` also clears ?gamePk= and ?date= once a deep
   * link has been consumed, matching what the page did before leagues existed.
   * Keeps history.state intact — the Angular router stores its own there.
   */
  private syncUrl(dropDeepLinkParams = false) {
    if (!this.isBrowser) return;
    try {
      const url = new URL(window.location.href);
      const isDefault = this.selectedLeagueIds.length === 1 && this.selectedLeagueIds[0] === DEFAULT_LEAGUE_IDS[0];
      if (isDefault) url.searchParams.delete('leagues');
      else url.searchParams.set('leagues', this.selectedLeagueIds.join(','));
      if (dropDeepLinkParams) { url.searchParams.delete('gamePk'); url.searchParams.delete('date'); }
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch { /* non-critical */ }
  }

  private sortGamesByFavorite(games: any[]): any[] {
    if (!games?.length) return games;
    const favSet = this.favorites.favorites;
    const hasFavs = favSet.size > 0;

    const isLive = (g: any) => g?.status?.abstractGameState === 'Live';

    return games
      .map((g, i) => ({
        g, i,
        live: isLive(g),
        fav: hasFavs && this.favorites.gameInvolvesFavorite(g)
      }))
      .sort((a, b) => {
        if (a.live !== b.live) return a.live ? -1 : 1;
        if (a.fav !== b.fav)   return a.fav  ? -1 : 1;
        return a.i - b.i;
      })
      .map(x => x.g);
  }

  isFavoriteGame(game: any): boolean { return this.favorites.gameInvolvesFavorite(game); }

  get hasLiveGames(): boolean {
    return this.games.some(g => g.status?.abstractGameState === 'Live');
  }

  openGame(game: any) {
    // If user clicked a postponed card and we're on the rescheduled date,
    // prefer the real makeup game entry for the same matchup if present.
    let target = game;
    if ((game?.status?.codedGameState === 'D' || game?.status?.detailedState === 'Postponed') && !game?.rescheduledFrom) {
      const awayId = game?.teams?.away?.team?.id;
      const homeId = game?.teams?.home?.team?.id;
      const makeup = this.games.find(g =>
        g.gamePk !== game.gamePk &&
        g?.teams?.away?.team?.id === awayId &&
        g?.teams?.home?.team?.id === homeId &&
        g?.status?.detailedState !== 'Postponed'
      );
      if (makeup) target = makeup;
    }

    this.selectedGame = target;
    this.boxscore = null;
    this.plays = null;
    this.liveFeed = null;
    this.loadingDetail = true;
    this.loadingPlays = true;

    this.refreshSelectedGame();
    setTimeout(() => {
      this.loadingDetail = false;
      this.loadingPlays = false;
    }, 200);

    this.startDetailPolling();
  }

  closeGame() {
    this.selectedGame = null;
    this.boxscore = null;
    this.plays = null;
    this.liveFeed = null;
    this.stopDetailPolling();
  }
}
