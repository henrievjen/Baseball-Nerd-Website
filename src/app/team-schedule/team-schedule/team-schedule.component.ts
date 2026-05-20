import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MlbApiService } from '../../shared/mlb-api.service';
import { TeamDataService } from '../../shared/team-data.service';

interface ScheduleGame {
  gamePk: number;
  date: Date;
  dateLabel: string;
  dayLabel: string;
  opponentId: number;
  opponentName: string;
  opponentAbbr: string;
  isHome: boolean;
  status: string;          // raw abstractGameState
  statusLabel: string;     // FINAL / LIVE / 7:10 PM / PPD
  teamScore?: number;
  oppScore?: number;
  result?: 'W' | 'L' | 'T';
  recordWins?: number;
  recordLosses?: number;
  venue?: string;
  gameType: string;
  gameTypeLabel: string;   // RS / WC / DS / CS / WS / SPRING etc.
  probablePitcherTeam?: string;
  probablePitcherOpp?: string;
}

@Component({
  selector: 'app-team-schedule',
  templateUrl: './team-schedule.component.html',
  styleUrl: './team-schedule.component.scss',
  standalone: false
})
export class TeamScheduleComponent implements OnInit, OnDestroy {
  teamId = 0;
  season = new Date().getFullYear();
  years: number[] = [];
  teamList: Array<{ id: number; name: string; abbr: string }> = [];

  games: ScheduleGame[] = [];
  loading = false;

  /** Filter: ALL | upcoming | completed */
  filter: 'all' | 'upcoming' | 'completed' = 'upcoming';

  private routeSub?: Subscription;
  private apiSub?: Subscription;

  constructor(
    private api: MlbApiService,
    public teams: TeamDataService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    const cur = new Date().getFullYear();
    for (let y = cur; y >= 1901; y--) this.years.push(y);
    this.teamList = this.teams.allTeams();
  }

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = Number(params.get('teamId') ?? 0);
      // Default to Yankees (147) if none picked, just so the page isn't empty.
      this.teamId = id || this.teamId || 147;
      this.loadSchedule();
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    this.apiSub?.unsubscribe();
  }

  onTeamChange(event: any) {
    const id = parseInt(event.target.value, 10);
    if (id && id !== this.teamId) {
      this.router.navigate(['/team-schedule', id]);
    }
  }

  onSeasonChange(event: any) {
    this.season = parseInt(event.target.value, 10);
    this.loadSchedule();
  }

  setFilter(f: 'all' | 'upcoming' | 'completed') { this.filter = f; }

  get teamName(): string { return this.teams.name(this.teamId) || ''; }
  get teamAbbr(): string { return this.teams.abbr(this.teamId) || ''; }

  get filteredGames(): ScheduleGame[] {
    if (this.filter === 'upcoming') return this.games.filter(g => g.status !== 'Final');
    if (this.filter === 'completed') return this.games.filter(g => g.status === 'Final');
    return this.games;
  }

  /** Quick stats: W-L for completed regular-season games only */
  get recordSummary(): string {
    let w = 0, l = 0;
    for (const g of this.games) {
      if (g.gameType !== 'R') continue; // exclude spring, postseason, all-star
      if (g.result === 'W') w++;
      else if (g.result === 'L') l++;
    }
    if (!w && !l) return '';
    return `${w}-${l}`;
  }

  loadSchedule() {
    if (!this.teamId) return;
    this.loading = true;
    this.games = [];
    this.apiSub?.unsubscribe();

    this.apiSub = this.api.getTeamSchedule(this.teamId, this.season).subscribe({
      next: (data: any) => {
        this.games = this.buildGames(data);
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private buildGames(data: any): ScheduleGame[] {
    const out: ScheduleGame[] = [];
    const dates = data?.dates ?? [];
    for (const dt of dates) {
      for (const g of (dt.games ?? [])) {
        const isHome = g.teams?.home?.team?.id === this.teamId;
        const me  = isHome ? g.teams.home : g.teams.away;
        const opp = isHome ? g.teams.away : g.teams.home;
        const myScore  = me?.score;
        const oppScore = opp?.score;
        const status = g.status?.abstractGameState ?? '';
        const detailed: string = g.status?.detailedState ?? '';
        const d = new Date(g.gameDate);
        const dateLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const dayLabel  = d.toLocaleDateString([], { weekday: 'short' });
        let statusLabel = '';
        if (status === 'Final') statusLabel = 'FINAL';
        else if (status === 'Live') statusLabel = this.liveInningLabel(g) || 'LIVE';
        else if (/postponed/i.test(detailed)) statusLabel = 'PPD';
        else if (/cancelled|canceled/i.test(detailed)) statusLabel = 'CANC';
        else statusLabel = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        let result: 'W' | 'L' | 'T' | undefined;
        if (status === 'Final' && typeof myScore === 'number' && typeof oppScore === 'number') {
          if (myScore > oppScore) result = 'W';
          else if (myScore < oppScore) result = 'L';
          else result = 'T';
        }

        const lr = me?.leagueRecord;

        out.push({
          gamePk: g.gamePk,
          date: d,
          dateLabel, dayLabel,
          opponentId: opp?.team?.id,
          opponentName: opp?.team?.name ?? '',
          opponentAbbr: this.teams.abbr(opp?.team?.id) || (opp?.team?.abbreviation ?? ''),
          isHome,
          status,
          statusLabel,
          teamScore: myScore,
          oppScore,
          result,
          recordWins: lr?.wins,
          recordLosses: lr?.losses,
          venue: g.venue?.name,
          gameType: g.gameType,
          gameTypeLabel: this.seriesLabel(g),
          probablePitcherTeam: me?.probablePitcher?.fullName,
          probablePitcherOpp:  opp?.probablePitcher?.fullName,
        });
      }
    }
    // Sort ascending by date
    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }

  /** Build a "Top 3rd" / "Bot 6th" / "Mid 4th" label from a game's linescore. */
  private liveInningLabel(g: any): string {
    const ls = g?.linescore;
    if (!ls) return '';
    const ord: string = ls.currentInningOrdinal
      || (ls.currentInning ? this.toOrdinal(ls.currentInning) : '');
    if (!ord) return '';
    const state: string = (ls.inningState || ls.inningHalf || '').toString().toLowerCase();
    let half = '';
    if (state === 'top') half = 'Top';
    else if (state === 'bottom') half = 'Bot';
    else if (state === 'middle' || state === 'mid') half = 'Mid';
    else if (state === 'end') half = 'End';
    return half ? `${half} ${ord}` : ord;
  }

  private toOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /**
   * Returns a descriptive label for any non-regular-season game.
   * Uses `seriesDescription` + `seriesGameNumber` when available, falling
   * back to the raw `gameType` code so we always show something.
   */
  private seriesLabel(g: any): string {
    const type: string = g?.gameType ?? '';
    if (type === 'R') return '';                  // regular season — no badge

    const desc: string = (g?.seriesDescription ?? '').trim();
    const gameNum: number | undefined = g?.seriesGameNumber;

    // Map the long description to a compact, recognizable abbreviation.
    const abbreviated = (() => {
      if (!desc) return '';
      const lower = desc.toLowerCase();
      if (lower.includes('world series'))            return 'World Series';
      if (lower.includes('al championship'))         return 'ALCS';
      if (lower.includes('nl championship'))         return 'NLCS';
      if (lower.includes('al division'))             return 'ALDS';
      if (lower.includes('nl division'))             return 'NLDS';
      if (lower.includes('al wild card'))            return 'AL Wild Card';
      if (lower.includes('nl wild card'))            return 'NL Wild Card';
      if (lower.includes('wild card'))               return 'Wild Card';
      if (lower.includes('spring training'))         return 'Spring Training';
      if (lower.includes('exhibition'))              return 'Exhibition';
      if (lower.includes('all-star') || lower.includes('all star')) return 'All-Star';
      return desc;
    })();

    // For multi-game playoff series, append "Game N".
    const isMultiGameSeries = ['F', 'D', 'L', 'W', 'P'].includes(type);
    if (isMultiGameSeries && gameNum) {
      return `${abbreviated} Game ${gameNum}`;
    }
    return abbreviated || this.fallbackGameTypeLabel(type);
  }

  private fallbackGameTypeLabel(t: string): string {
    switch (t) {
      case 'S': return 'Spring Training';
      case 'E': return 'Exhibition';
      case 'F': return 'Wild Card';
      case 'D': return 'Division Series';
      case 'L': return 'Championship Series';
      case 'W': return 'World Series';
      case 'P': return 'Playoff';
      case 'A': return 'All-Star';
      default:  return t || '';
    }
  }

  navigateToOpponent(id: number) {
    if (!id || id === this.teamId) return;
    this.router.navigate(['/team-schedule', id]);
  }

  openGame(g: ScheduleGame) {
    if (!g?.gamePk) return;
    const d = g.date;
    const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    this.router.navigate(['/scores'], { queryParams: { date: dateStr, gamePk: g.gamePk } });
  }

  trackByGame(_: number, g: ScheduleGame) { return g.gamePk; }
  trackByTeam(_: number, t: { id: number }) { return t.id; }
  trackByYear(_: number, y: number) { return y; }
  logoError(ev: Event) { (ev.target as HTMLImageElement).style.display = 'none'; }
}

