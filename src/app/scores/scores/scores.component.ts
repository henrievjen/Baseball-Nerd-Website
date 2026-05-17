import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { MlbApiService } from '../../shared/mlb-api.service';
import { Subscription, timer, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';

export interface DateTab {
  date: Date;
  dateStr: string;
  label: string;
  shortDate: string;
}

@Component({
  selector: 'app-scores',
  templateUrl: './scores.component.html',
  styleUrls: ['./scores.component.scss']
})
export class ScoresComponent implements OnInit, OnDestroy, AfterViewInit {
  dateTabs: DateTab[] = [];
  activeDateIdx = 0;
  games: any[] = [];
  loading = false;
  selectedGame: any = null;
  boxscore: any = null;
  loadingDetail = false;

  private pollSub?: Subscription;
  private days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  private months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  constructor(private api: MlbApiService) {}

  ngOnInit() {
    this.buildDateTabs();
    this.startPolling(true);
  }

  ngAfterViewInit() {
    // Initial centering of Today tab
    this.centerActiveTab('auto');
  }

  ngOnDestroy() {
    this.stopPolling();
  }

  /**
   * Builds the horizontal date strip around a base date.
   * @param baseDate The date to center the range around. Defaults to today.
   */
  buildDateTabs(baseDate: Date = new Date()) {
    const centerDate = new Date(baseDate);
    centerDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Range: 30 days back, 120 days forward from baseDate
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
    // Timeout ensures DOM is rendered and scroll dimensions are correct
    setTimeout(() => {
      const activeEl = document.querySelector('.date-tab.active');
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: behavior as ScrollBehavior,
          inline: 'center',
          block: 'nearest'
        });
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
  }

  /**
   * Triggered when a date is selected from the calendar picker.
   */
  onCalendarDateChange(event: any) {
    const val = event.target.value;
    if (!val) return;

    // Parse the date (yyyy-mm-dd)
    const [y, m, d] = val.split('-').map(Number);
    const selectedDate = new Date(y, m - 1, d);
    selectedDate.setHours(0, 0, 0, 0);

    // Check if it's already in our current tabs
    const existingIdx = this.dateTabs.findIndex(t => t.dateStr === val);

    if (existingIdx !== -1) {
      this.selectDate(existingIdx);
    } else {
      // Rebuild tabs around this new date and select it
      this.buildDateTabs(selectedDate);
      this.startPolling(true);
      this.centerActiveTab('auto');
    }
  }

  startPolling(initial: boolean = false) {
    this.stopPolling();
    if (initial) {
      this.loading = true;
      this.games = [];
    }

    const selectedDate = this.dateTabs[this.activeDateIdx].date;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = selectedDate.getTime() === today.getTime();

    const interval = isToday ? 15000 : 300000;

    this.pollSub = timer(0, interval).pipe(
      switchMap(() => {
        const tab = this.dateTabs[this.activeDateIdx];
        return this.api.getSchedule({ date: tab.dateStr }).pipe(
          catchError(() => of({ dates: [] }))
        );
      })
    ).subscribe({
      next: (data) => {
        const newGames = (data.dates ?? []).flatMap((d: any) => d.games ?? []);
        this.updateGames(newGames);
        this.loading = false;

        if (this.selectedGame) {
          this.refreshSelectedGame();
        }
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  private updateGames(newGames: any[]) {
    this.games = newGames;

    if (this.selectedGame) {
      const updated = newGames.find(g => g.gamePk === this.selectedGame.gamePk);
      if (updated) {
        this.selectedGame = updated;
      }
    }
  }

  private refreshSelectedGame() {
    if (!this.selectedGame) return;
    this.api.getBoxscore(this.selectedGame.gamePk).pipe(
      catchError(() => of(null))
    ).subscribe({
      next: (bs) => {
        if (bs) this.boxscore = bs;
      }
    });
  }

  stopPolling() {
    if (this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = undefined;
    }
  }

  trackByGamePk(index: number, game: any) {
    return game.gamePk;
  }

  openGame(game: any) {
    this.selectedGame = game;
    this.boxscore = null;
    this.loadingDetail = true;
    this.api.getBoxscore(game.gamePk).subscribe({
      next: (bs) => {
        this.boxscore = bs;
        this.loadingDetail = false;
      },
      error: () => {
        this.loadingDetail = false;
      }
    });
  }

  closeGame() {
    this.selectedGame = null;
    this.boxscore = null;
  }
}
