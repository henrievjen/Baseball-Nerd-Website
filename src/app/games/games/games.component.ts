import { Component, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TeamDataService } from '../../shared/team-data.service';

type PlayResult = 'home_run' | 'triple' | 'double' | 'single' | 'walk' | 'error'
  | 'strikeout' | 'pop_out' | 'fly_out' | 'ground_out' | 'double_play';
type GamePhase = 'menu' | 'setup' | 'playing' | 'game_over';
type HalfInning = 'top' | 'bottom';

interface RunnerState { first: boolean; second: boolean; third: boolean; }
interface InningScore { top: number | null; bottom: number | null; }
interface MlbTeam { id: number; name: string; abbr: string; }
interface Batter { id: number; name: string; position: string; }

const DICE_TABLE: Record<string, PlayResult> = {
  '1-1':'home_run','1-2':'double',    '1-3':'single',
  '1-4':'pop_out', '1-5':'ground_out','1-6':'strikeout',
  '2-2':'single',  '2-3':'pop_out',  '2-4':'ground_out',
  '2-5':'strikeout','2-6':'ground_out','3-3':'single',
  '3-4':'strikeout','3-5':'ground_out','3-6':'fly_out',
  '4-4':'walk',    '4-5':'fly_out',  '4-6':'fly_out',
  '5-5':'error',   '5-6':'single',   '6-6':'triple',
};

export const RESULT_LABELS: Record<PlayResult, string> = {
  home_run:'HOME RUN!', triple:'TRIPLE!', double:'DOUBLE!', single:'SINGLE!',
  walk:'WALK', error:'BASE ON ERROR', strikeout:'STRIKEOUT', pop_out:'POP OUT',
  fly_out:'FLY OUT', ground_out:'GROUND OUT', double_play:'DOUBLE PLAY!',
};

export const DICE_LEGEND: Array<{ combo: string; result: PlayResult; note?: string }> = [
  { combo:'1–1', result:'home_run' },
  { combo:'1–2', result:'double' },
  { combo:'1–3', result:'single' },
  { combo:'1–4', result:'pop_out' },
  { combo:'1–5', result:'ground_out', note:'DP if force' },
  { combo:'1–6', result:'strikeout' },
  { combo:'2–2', result:'single' },
  { combo:'2–3', result:'pop_out' },
  { combo:'2–4', result:'ground_out' },
  { combo:'2–5', result:'strikeout' },
  { combo:'2–6', result:'ground_out' },
  { combo:'3–3', result:'single' },
  { combo:'3–4', result:'strikeout' },
  { combo:'3–5', result:'ground_out' },
  { combo:'3–6', result:'fly_out' },
  { combo:'4–4', result:'walk' },
  { combo:'4–5', result:'fly_out' },
  { combo:'4–6', result:'fly_out' },
  { combo:'5–5', result:'error' },
  { combo:'5–6', result:'single' },
  { combo:'6–6', result:'triple' },
];

@Component({
  selector: 'app-games',
  templateUrl: './games.component.html',
  styleUrl: './games.component.scss',
  standalone: false
})
export class GamesComponent implements OnDestroy {
  phase: GamePhase = 'menu';

  // Team selection
  allTeams: MlbTeam[] = [];
  awayTeamId: number | null = null;
  homeTeamId: number | null = null;
  awayTeamName = 'AWAY';
  homeTeamName = 'HOME';
  awayRoster: Batter[] = [];
  homeRoster: Batter[] = [];
  loadingRoster = false;
  playerSide: 'away' | 'home' = 'away';

  // Dice state
  die1 = 1; die2 = 1;
  die1Face = 1; die2Face = 1;
  isRolling = false;
  rollInterval: any = null;

  // Game state
  inning = 1;
  half: HalfInning = 'top';
  outs = 0;
  runners: RunnerState = { first: false, second: false, third: false };
  scores: InningScore[] = Array.from({ length: 9 }, () => ({ top: null, bottom: null }));
  awayTotal = 0; homeTotal = 0;
  awayHits = 0; homeHits = 0;
  awayErrors = 0; homeErrors = 0;
  halfInningRuns = 0;

  lastResult: PlayResult | null = null;
  lastResultLabel = '';
  showResult = false;
  resultTimeout: any = null;
  playLog: string[] = [];
  gameOverMessage = '';
  awayBatterIdx = 0;
  homeBatterIdx = 0;

  legendOpen = true;
  readonly legend = DICE_LEGEND;
  readonly resultLabels = RESULT_LABELS;

  constructor(private http: HttpClient, private teamData: TeamDataService) {
    this.allTeams = this.teamData.allTeams();
  }

  // ── Team selection ──────────────────────────────────────────────────────
  onTeamSelect(side: 'away' | 'home', idStr: string) {
    const id = Number(idStr);
    if (side === 'away') { this.awayTeamId = id; this.awayTeamName = this.teamData.abbr(id); }
    else                 { this.homeTeamId = id; this.homeTeamName = this.teamData.abbr(id); }
    this.fetchRoster(id, side);
  }

  private fetchRoster(teamId: number, side: 'away' | 'home') {
    this.loadingRoster = true;
    const season = new Date().getFullYear();
    this.http.get<any>(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster`, {
      params: { rosterType: 'active', season: String(season),
                hydrate: 'person(fullName,primaryPosition)' }
    }).subscribe({
      next: (data) => {
        const hitters = (data.roster || [])
          .filter((p: any) => p.person?.primaryPosition?.code !== '1') // exclude pitchers
          .map((p: any): Batter => ({
            id: p.person.id,
            name: p.person.fullName,
            position: p.person.primaryPosition?.abbreviation ?? ''
          }))
          .slice(0, 9);
        // Pad if fewer than 9
        while (hitters.length < 9) {
          hitters.push({ id: 0, name: `Player ${hitters.length + 1}`, position: '' });
        }
        if (side === 'away') this.awayRoster = hitters;
        else this.homeRoster = hitters;
        this.loadingRoster = false;
      },
      error: () => {
        if (side === 'away') this.awayRoster = this.genericLineup();
        else this.homeRoster = this.genericLineup();
        this.loadingRoster = false;
      }
    });
  }

  private genericLineup(): Batter[] {
    return Array.from({ length: 9 }, (_, i) => ({ id: 0, name: `Batter ${i + 1}`, position: '' }));
  }

  // ── Computed ───────────────────────────────────────────────────────────
  get currentTeam(): string { return this.half === 'top' ? this.awayTeamName : this.homeTeamName; }
  get inningLabel(): string { return `${this.half === 'top' ? '▲' : '▼'} ${this.inning}`; }
  get innings(): number[]   { return Array.from({ length: 9 }, (_, i) => i + 1); }
  get runnerOnFirst(): boolean  { return this.runners.first; }
  get runnerOnSecond(): boolean { return this.runners.second; }
  get runnerOnThird(): boolean  { return this.runners.third; }

  get currentBatterName(): string {
    if (this.half === 'top') {
      const r = this.awayRoster[this.awayBatterIdx % 9];
      return r ? r.name : '';
    } else {
      const r = this.homeRoster[this.homeBatterIdx % 9];
      return r ? r.name : '';
    }
  }
  get currentBatterNum(): number {
    return this.half === 'top'
      ? (this.awayBatterIdx % 9) + 1
      : (this.homeBatterIdx % 9) + 1;
  }
  get currentBatterId(): number {
    if (this.half === 'top') {
      return this.awayRoster[this.awayBatterIdx % 9]?.id ?? 0;
    }
    return this.homeRoster[this.homeBatterIdx % 9]?.id ?? 0;
  }
  get currentBatterPosition(): string {
    if (this.half === 'top') {
      return this.awayRoster[this.awayBatterIdx % 9]?.position ?? '';
    }
    return this.homeRoster[this.homeBatterIdx % 9]?.position ?? '';
  }
  get currentTeamId(): number | null {
    return this.half === 'top' ? this.awayTeamId : this.homeTeamId;
  }
  playerPhotoUrl(playerId: number): string {
    return `https://midfield.mlbstatic.com/v1/people/${playerId}/spots/120`;
  }
  teamLogoUrl(teamId: number | null): string {
    return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : '';
  }

  // ── Game flow ──────────────────────────────────────────────────────────
  goToSetup() { this.phase = 'setup'; }

  setPlayerSide(side: 'away' | 'home') { this.playerSide = side; }

  startGame() {
    this.phase = 'playing';
    this.resetGameState();
  }

  private resetGameState() {
    this.inning = 1; this.half = 'top'; this.outs = 0;
    this.runners = { first: false, second: false, third: false };
    this.scores = Array.from({ length: 9 }, () => ({ top: null, bottom: null }));
    this.awayTotal = 0; this.homeTotal = 0;
    this.awayHits = 0; this.homeHits = 0;
    this.awayErrors = 0; this.homeErrors = 0;
    this.halfInningRuns = 0; this.lastResult = null;
    this.showResult = false; this.playLog = [];
    this.awayBatterIdx = 0; this.homeBatterIdx = 0;
    this.die1 = 1; this.die2 = 1; this.die1Face = 1; this.die2Face = 1;
  }

  rollDice() {
    if (this.isRolling || this.phase !== 'playing') return;
    this.isRolling = true;
    this.showResult = false;
    if (this.resultTimeout) clearTimeout(this.resultTimeout);

    // Determine the final result up front so display and lookup always match
    const d1 = Math.ceil(Math.random() * 6);
    const d2 = Math.ceil(Math.random() * 6);
    const finalLow  = Math.min(d1, d2);
    const finalHigh = Math.max(d1, d2);

    let ticks = 0;
    const totalTicks = 18;
    this.rollInterval = setInterval(() => {
      // Animate with random faces during roll
      this.die1Face = Math.ceil(Math.random() * 6);
      this.die2Face = Math.ceil(Math.random() * 6);
      ticks++;
      if (ticks >= totalTicks) {
        clearInterval(this.rollInterval);
        // Land on the pre-determined values
        this.die1 = finalLow;
        this.die2 = finalHigh;
        this.die1Face = finalLow;
        this.die2Face = finalHigh;
        this.isRolling = false;
        this.resolvePlay();
      }
    }, 60);
  }

  private resolvePlay() {
    const key = `${this.die1}-${this.die2}`;
    let result: PlayResult = DICE_TABLE[key] ?? 'ground_out';
    if (result === 'ground_out' && this.runners.first && this.outs < 2) result = 'double_play';

    this.lastResult = result;
    this.lastResultLabel = RESULT_LABELS[result];
    this.showResult = true;

    if (['home_run','triple','double','single'].includes(result)) {
      if (this.half === 'top') this.awayHits++; else this.homeHits++;
    }
    if (result === 'error') {
      if (this.half === 'top') this.homeErrors++; else this.awayErrors++;
    }
    this.applyPlay(result);
    this.logPlay(result);
    if (this.outs >= 3) {
      this.resultTimeout = setTimeout(() => this.endHalfInning(), 1400);
    }
  }

  private applyPlay(result: PlayResult) {
    switch (result) {
      case 'home_run': {
        const runs = 1 + [this.runners.first, this.runners.second, this.runners.third].filter(Boolean).length;
        this.addRuns(runs);
        this.runners = { first: false, second: false, third: false };
        break;
      }
      case 'triple': {
        const runs = [this.runners.first, this.runners.second, this.runners.third].filter(Boolean).length;
        this.addRuns(runs);
        this.runners = { first: false, second: false, third: true };
        break;
      }
      case 'double': {
        let runs = 0;
        if (this.runners.third) runs++;
        if (this.runners.second) runs++;
        this.addRuns(runs);
        this.runners = { first: false, second: true, third: this.runners.first };
        break;
      }
      case 'single': case 'walk': case 'error': {
        let runs = 0;
        if (this.runners.third) runs++;
        const newThird = this.runners.second;
        const newSecond = this.runners.first;
        this.addRuns(runs);
        this.runners = { first: true, second: newSecond, third: newThird };
        break;
      }
      case 'double_play':
        this.outs += 2;
        this.runners.first = false;
        break;
      default:
        this.outs++;
        break;
    }
    if (this.half === 'top') this.awayBatterIdx++;
    else this.homeBatterIdx++;
  }

  private addRuns(runs: number) {
    this.halfInningRuns += runs;
    if (this.half === 'top') this.awayTotal += runs; else this.homeTotal += runs;
  }

  private logPlay(result: PlayResult) {
    const name = this.currentBatterName || `#${this.currentBatterNum}`;
    const label = RESULT_LABELS[result];
    const dice = `[${this.die1}–${this.die2}]`;
    this.playLog.unshift(`${this.inningLabel} ${name}: ${label} ${dice}`);
    if (this.playLog.length > 20) this.playLog.pop();
  }

  private endHalfInning() {
    const idx = this.inning - 1;
    if (this.half === 'top') this.scores[idx].top = this.halfInningRuns;
    else this.scores[idx].bottom = this.halfInningRuns;

    this.halfInningRuns = 0;
    this.runners = { first: false, second: false, third: false };
    this.outs = 0;
    this.showResult = false;

    if (this.half === 'bottom' && this.homeTotal > this.awayTotal && this.inning >= 9) { this.endGame(); return; }
    if (this.half === 'top' && this.inning === 9) {
      this.half = 'bottom';
      if (this.awayTotal < this.homeTotal) { this.endGame(); return; }
    } else if (this.half === 'top') {
      this.half = 'bottom';
    } else {
      this.half = 'top';
      this.inning++;
      if (this.inning > 9) { this.endGame(); return; }
    }
  }

  private endGame() {
    const idx = this.inning - 1;
    if (idx < 9) {
      if (this.scores[idx].top === null) this.scores[idx].top = 0;
      if (this.half === 'bottom' && this.scores[idx].bottom === null) this.scores[idx].bottom = this.halfInningRuns;
    }
    if (this.awayTotal > this.homeTotal)
      this.gameOverMessage = `${this.awayTeamName} wins ${this.awayTotal}–${this.homeTotal}!`;
    else if (this.homeTotal > this.awayTotal)
      this.gameOverMessage = `${this.homeTeamName} wins ${this.homeTotal}–${this.awayTotal}!`;
    else
      this.gameOverMessage = `Tie game! ${this.homeTotal}–${this.awayTotal}`;
    this.phase = 'game_over';
  }

  getScore(inningIdx: number, half: 'top' | 'bottom'): string {
    const val = half === 'top' ? this.scores[inningIdx].top : this.scores[inningIdx].bottom;
    return val === null ? '' : String(val);
  }

  getResultClass(): string {
    if (!this.lastResult) return '';
    if (this.lastResult === 'home_run') return 'res-homerun';
    if (['triple','double','single'].includes(this.lastResult)) return 'res-hit';
    if (['walk','error'].includes(this.lastResult)) return 'res-onbase';
    if (this.lastResult === 'double_play') return 'res-dp';
    return 'res-out';
  }

  getLegendClass(result: PlayResult): string {
    if (result === 'home_run') return 'leg-homerun';
    if (result === 'triple') return 'leg-triple';
    if (result === 'double') return 'leg-double';
    if (result === 'single') return 'leg-single';
    if (result === 'walk' || result === 'error') return 'leg-onbase';
    return 'leg-out';
  }

  backToMenu() { this.phase = 'menu'; }

  ngOnDestroy() {
    if (this.rollInterval) clearInterval(this.rollInterval);
    if (this.resultTimeout) clearTimeout(this.resultTimeout);
  }
}
