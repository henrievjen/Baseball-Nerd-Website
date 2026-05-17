import { Component, OnInit, OnDestroy, AfterViewInit, HostListener } from '@angular/core';
import { MlbApiService } from '../../shared/mlb-api.service';
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

  /** Sync the calendar view to the currently selected date strip tab. */
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

  /** Close calendar when clicking outside it. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent) {
    if (!this.calendarOpen) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.calendar-picker')) this.calendarOpen = false;
  }
  // ─────────────────────────────────────────────────────

  private pollSub?: Subscription;
  private days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  private months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  constructor(private api: MlbApiService) {}

  ngOnInit() {
    this.buildDateTabs();
    this.startPolling(true);
  }

  ngAfterViewInit() {
    this.centerActiveTab('auto');
  }

  ngOnDestroy() {
    this.stopPolling();
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
        label: isToday ? 'Today' : this.days[d.getDay()],
        shortDate: `${this.months[d.getMonth()]} ${d.getDate()}`
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
    // Keep calendar grid in sync if open
    if (this.calendarOpen) this.buildCalendarGrid();
  }

  /** True when the currently selected tab is today. */
  get isOnToday(): boolean {
    const sel = this.dateTabs[this.activeDateIdx]?.date;
    if (!sel) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const s = new Date(sel);  s.setHours(0, 0, 0, 0);
    return s.getTime() === today.getTime();
  }

  /** Navigate the date strip back to today and reload games. */
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

  /** @deprecated native picker — kept so nothing breaks if referenced elsewhere */
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
        if (this.selectedGame) this.refreshSelectedGame();
      },
      error: () => { this.loading = false; }
    });
  }

  private updateGames(newGames: any[]) {
    this.games = newGames;
    if (this.selectedGame) {
      const updated = newGames.find(g => g.gamePk === this.selectedGame.gamePk);
      if (updated) this.selectedGame = updated;
    }
  }

  private refreshSelectedGame() {
    if (!this.selectedGame) return;
    this.api.getBoxscore(this.selectedGame.gamePk).pipe(catchError(() => of(null)))
      .subscribe({ next: (bs) => { if (bs) this.boxscore = bs; } });
    this.api.getPlayByPlay(this.selectedGame.gamePk).pipe(catchError(() => of(null)))
      .subscribe({ next: (p) => { if (p) this.plays = p; } });
  }

  stopPolling() {
    if (this.pollSub) { this.pollSub.unsubscribe(); this.pollSub = undefined; }
  }

  trackByGamePk(_index: number, game: any) { return game.gamePk; }

  openGame(game: any) {
    this.selectedGame = game;
    this.boxscore = null;
    this.plays = null;
    this.loadingDetail = true;
    this.loadingPlays = true;
    this.api.getBoxscore(game.gamePk).subscribe({
      next: (bs) => { this.boxscore = bs; this.loadingDetail = false; },
      error: () => { this.loadingDetail = false; }
    });
    this.api.getPlayByPlay(game.gamePk).subscribe({
      next: (p) => { this.plays = p; this.loadingPlays = false; },
      error: () => { this.loadingPlays = false; }
    });
  }

  closeGame() { this.selectedGame = null; this.boxscore = null; this.plays = null; }
}