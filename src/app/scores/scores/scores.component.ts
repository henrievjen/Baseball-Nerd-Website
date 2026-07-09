import {AfterViewInit, Component, HostListener, OnDestroy, OnInit} from "@angular/core";
import { ActivatedRoute } from '@angular/router';
import { MlbApiService } from '../../shared/mlb-api.service';
import { FavoriteTeamsService } from '../../shared/favorite-teams.service';
import { SeoService } from '../../shared/seo.service';
import { Subscription, timer, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';

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

  constructor(private api: MlbApiService, private route: ActivatedRoute, public favorites: FavoriteTeamsService, private seo: SeoService) {}

  private pendingGamePk?: number;

  ngOnInit() {
    this.seo.update(
      "Today's MLB Scores & Live Box Scores | Baseball Nerd",
      "Live MLB scores for today's games with inning-by-inning updates, starting pitcher matchups, and final results, sourced directly from the official MLB Stats API."
    );
    const qp = this.route.snapshot.queryParamMap;
    const dateStr = qp.get('date');
    const gp = qp.get('gamePk');
    if (gp) this.pendingGamePk = Number(gp);

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
    this.stopPolling();
    if (initial) { this.loading = true; this.games = []; }

    const selectedDate = this.dateTabs[this.activeDateIdx].date;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isToday = selectedDate.getTime() === today.getTime();
    const interval = isToday ? 15000 : 300000;

    this.pollSub = timer(0, interval).pipe(
      switchMap(() => {
        const tab = this.dateTabs[this.activeDateIdx];
        return this.api.getSchedule({ date: tab.dateStr }).pipe(catchError(() => of({ dates: [] })));
      })
    ).subscribe({
      next: (data) => {
        const newGames = (data.dates ?? []).flatMap((d: any) => d.games ?? []);
        this.updateGames(newGames);
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
        history.replaceState(null, '', '/scores');
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
    this.api.getSchedule({ date: tab.dateStr })
      .pipe(catchError(() => of(null)))
      .subscribe(data => {
        const allGames = (data?.dates?.[0]?.games ?? []);
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
