import { Component, Input, Output, EventEmitter, HostListener, OnChanges } from '@angular/core';
import { TeamDataService } from '../../shared/team-data.service';
import { PlayerService } from '../../shared/player.service';

/** One batting-order slot (1–9) with its starter + any substitutes. */
export interface LineupSlot {
  lineupNum: number;      // 1–9
  starter: any;
  subs: any[];
}

export interface PlayEvent {
  inning: number;
  half: 'Top' | 'Bottom';
  inningLabel: string;
  description: string;
  result: string;
  resultType: 'out' | 'hit' | 'run' | 'walk' | 'strikeout' | 'homerun' | 'other';
  pitches: PitchEvent[];
  awayScore?: number;
  homeScore?: number;
}

export interface PitchEvent {
  num: number;
  description: string;
  speed?: number;
  callCode: string;
  isBall: boolean;
  isStrike: boolean;
  isInPlay: boolean;
}

@Component({
  selector: 'app-game-detail',
  templateUrl: './game-detail.component.html',
  styleUrl: './game-detail.component.scss',
  standalone: false
})
export class GameDetailComponent implements OnChanges {
  @Input() game: any;
  @Input() boxscore: any;
  @Input() loading = false;
  @Input() plays: any = null;
  @Input() loadingPlays = false;
  @Output() closed = new EventEmitter<void>();

  mainTab: 'lineups' | 'plays' = 'lineups';

  constructor(public teams: TeamDataService, private playerSvc: PlayerService) {}

  @HostListener('document:keydown.escape')
  onEscape() { this.closed.emit(); }

  closeOnOverlay(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closed.emit();
  }

  ngOnChanges() {
    if (!this.boxscore && !this.plays) this.mainTab = 'lineups';
  }

  // ── Game state ─────────────────────────────────────────────
  get away()   { return this.game?.teams?.away; }
  get home()   { return this.game?.teams?.home; }
  get awayId() { return this.away?.team?.id; }
  get homeId() { return this.home?.team?.id; }
  get awayBs() { return this.boxscore?.teams?.away; }
  get homeBs() { return this.boxscore?.teams?.home; }

  get state(): 'live' | 'final' | 'upcoming' {
    const s = this.game?.status?.abstractGameState;
    if (s === 'Live') return 'live';
    if (s === 'Final') return 'final';
    return 'upcoming';
  }

  get ls()          { return this.game?.linescore || {}; }
  get inningLabel() {
    const half  = this.ls.inningHalf;
    const arrow = half === 'Top' ? '▲' : half === 'Bottom' ? '▼' : '';
    return `${arrow} ${this.ls.currentInningOrdinal || ''}`.trim();
  }
  get innings()   { return this.ls.innings || []; }
  get awayLineR() { return this.ls.teams?.away?.runs  ?? ''; }
  get homeLineR() { return this.ls.teams?.home?.runs  ?? ''; }
  get awayLineH() { return this.ls.teams?.away?.hits  ?? ''; }
  get homeLineH() { return this.ls.teams?.home?.hits  ?? ''; }
  get awayLineE() { return this.ls.teams?.away?.errors ?? ''; }
  get homeLineE() { return this.ls.teams?.home?.errors ?? ''; }

  // ── Lineup building ─────────────────────────────────────────
  /**
   * Returns batters grouped into 9 lineup slots.
   * - Pitchers (position.code === '1') are excluded.
   * - battingOrder XXX: slot = Math.floor(XXX/100), isStarter = XXX%100===0
   * - Slot 0 (DH-type or unknown order) appended at end without a number.
   */
  getLineupSlots(teamBs: any): LineupSlot[] {
    if (!teamBs?.batters) return [];

    const players = teamBs.batters
      .map((id: number) => teamBs.players?.[`ID${id}`])
      .filter((p: any) => !!p && p.position?.code !== '1');   // exclude pitchers

    // Group by batting-order slot (1–9)
    const slotMap = new Map<number, any[]>();
    for (const p of players) {
      const order   = p.battingOrder ?? 0;
      const slotNum = Math.floor(order / 100);
      if (!slotMap.has(slotNum)) slotMap.set(slotNum, []);
      slotMap.get(slotNum)!.push(p);
    }

    // Build sorted array of LineupSlot objects
    const slots: LineupSlot[] = [];
    const sortedKeys = [...slotMap.keys()].sort((a, b) => a - b);

    for (const key of sortedKeys) {
      const group = slotMap.get(key)!.sort((a: any, b: any) =>
        (a.battingOrder ?? 0) - (b.battingOrder ?? 0)
      );
      slots.push({
        lineupNum: key > 0 ? key : 0,
        starter:   group[0],
        subs:      group.slice(1),
      });
    }
    return slots;
  }

  getPitchers(teamBs: any): any[] {
    if (!teamBs?.pitchers) return [];
    return teamBs.pitchers
      .map((id: number) => teamBs.players?.[`ID${id}`])
      .filter((p: any) => !!p);
  }

  // ── Stat helpers ────────────────────────────────────────────
  /**
   * Game stats (AB, R, H, RBI, HR, BB, K) come from p.stats.batting.
   * Season stats (AVG, OBP, SLG, OPS) come from p.seasonStats.batting.
   */
  gameBat(p: any, field: string): string | number {
    return p?.stats?.batting?.[field] ?? '';
  }

  seasonBat(p: any, field: string): string {
    return p?.seasonStats?.batting?.[field] ?? '—';
  }

  /**
   * Pitching game stats come from p.stats.pitching.
   * ERA and WHIP come from p.seasonStats.pitching.
   */
  gamePit(p: any, field: string): string | number {
    return p?.stats?.pitching?.[field] ?? '';
  }

  seasonPit(p: any, field: string): string {
    return p?.seasonStats?.pitching?.[field] ?? '—';
  }

  openPlayer(player: any) {
    const id = player?.person?.id;
    if (id) this.playerSvc.openPlayer(id);
  }

  logoError(ev: Event) { (ev.target as HTMLImageElement).style.display = 'none'; }

  // ── Play-by-play ────────────────────────────────────────────
  get parsedPlays(): PlayEvent[] {
    const allPlays: any[] = this.plays?.allPlays ?? [];
    if (!allPlays.length) return [];

    const events: PlayEvent[] = allPlays.map((play: any) => {
      const about   = play.about ?? {};
      const result  = play.result ?? {};
      const inning  = about.inning ?? 0;
      const halfStr = about.halfInning === 'top' ? 'Top' : 'Bottom';
      const ordinal = this.toOrdinal(inning);

      const pitches: PitchEvent[] = (play.pitchIndex ?? []).map((pi: number) => {
        const pe      = play.playEvents?.[pi] ?? {};
        const details = pe.details ?? {};
        const code    = details.code ?? '';
        return {
          num:         pe.pitchNumber ?? (pi + 1),
          description: details.description ?? '',
          speed:       pe.pitchData?.startSpeed ?? undefined,
          callCode:    code,
          isBall:      ['B','I','P','V'].includes(code),
          isStrike:    ['C','S','F','T','L','O','M','Q','R'].includes(code),
          isInPlay:    code === 'X',
        };
      });

      const eventType = result.eventType ?? result.event ?? '';
      let resultType: PlayEvent['resultType'] = 'other';
      if      (/strikeout/i.test(eventType))                 resultType = 'strikeout';
      else if (/home.run/i.test(eventType))                  resultType = 'homerun';
      else if (/walk|intent/i.test(eventType))               resultType = 'walk';
      else if (/single|double|triple/i.test(eventType))      resultType = 'hit';
      else if (/out|fly|ground|line|pop|force|field/i.test(eventType)) resultType = 'out';
      else if (/score|run/i.test(eventType))                 resultType = 'run';

      return {
        inning, half: halfStr as 'Top' | 'Bottom',
        inningLabel: `${halfStr === 'Top' ? '▲' : '▼'} ${ordinal}`,
        description: result.description ?? '',
        result:      result.event ?? '',
        resultType,
        pitches,
        awayScore:   about.awayScore,
        homeScore:   about.homeScore,
      };
    });

    return events.reverse();
  }

  private toOrdinal(n: number): string {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  pitchCallClass(code: string): string {
    if (['B','I','P','V'].includes(code)) return 'pitch-ball';
    if (code === 'X')                     return 'pitch-inplay';
    if (['C','S','F','T','L','O','M','Q','R'].includes(code)) return 'pitch-strike';
    return 'pitch-other';
  }

  pitchCallLabel(code: string): string {
    const labels: Record<string, string> = {
      'B':'Ball','C':'Called Strike','S':'Swinging Strike',
      'F':'Foul','T':'Foul Tip','L':'Foul Bunt',
      'X':'In Play','I':'Int. Ball','P':'Pitchout',
      'O':'Swinging Strike (Bunt)','M':'Missed Bunt',
    };
    return labels[code] ?? code;
  }
}