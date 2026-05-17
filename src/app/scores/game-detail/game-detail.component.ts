import { Component, Input, Output, EventEmitter, HostListener, OnChanges } from '@angular/core';
import { TeamDataService } from '../../shared/team-data.service';
import { PlayerService } from '../../shared/player.service';

export interface LineupSlot {
  lineupNum: number;
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

/** A pitch plotted on the SVG strikezone */
export interface ZonePitch {
  cx: number;           // SVG x
  cy: number;           // SVG y
  callCode: string;
  label: string;
  speed?: number;
  pitchType?: string;
  num: number;
  isCurrent: boolean;   // most recent pitch of the at-bat
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
  @Input() liveFeed: any = null;
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

  // ── Game state ──────────────────────────────────────────────
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

  // ── Live strikezone ─────────────────────────────────────────
  /**
   * SVG canvas constants.
   * The MLB coordinate system:
   *   pX: feet from centre plate, positive = catcher's right (pitcher's LEFT)
   *   pZ: feet above ground
   * Pitch view = from the pitcher's perspective, so we FLIP pX (mirror left/right).
   * Typical strike zone: pX ±0.83 ft (half plate 17 in + half ball ~1.45 in each side)
   *                      pZ ~1.5–3.5 ft (varies by batter; use strikeZoneBottom/Top)
   * We render a 300×340 SVG.
   */
  private readonly SVG_W   = 300;
  private readonly SVG_H   = 340;
  private readonly PAD     = 40;   // padding around zone

  /** Horizontal: map pX ∈ [-1.6, 1.6] → SVG x, flipped (pitcher's view) */
  private toSvgX(pX: number): number {
    const rangeX = 3.2;
    const drawW  = this.SVG_W - this.PAD * 2;
    // flip: pitcher sees catcher's right on the left
    return this.PAD + drawW * (1 - (pX + rangeX / 2) / rangeX);
  }

  /** Vertical: map pZ ∈ [0, 5] → SVG y (invert so higher = up) */
  private toSvgY(pZ: number): number {
    const maxZ  = 5.0;
    const drawH = this.SVG_H - this.PAD * 2;
    return this.PAD + drawH * (1 - pZ / maxZ);
  }

  /** The strike zone rect in SVG coords, computed from live feed */
  get szRect(): { x: number; y: number; w: number; h: number } {
    const play = this.liveFeed?.liveData?.plays?.currentPlay;
    const szTop    = play?.pitchIndex?.length
      ? (this.currentAtBatEvents.find((e: any) => e.pitchData?.strikeZoneTop)?.pitchData?.strikeZoneTop ?? 3.5)
      : 3.5;
    const szBottom = play?.pitchIndex?.length
      ? (this.currentAtBatEvents.find((e: any) => e.pitchData?.strikeZoneBottom)?.pitchData?.strikeZoneBottom ?? 1.5)
      : 1.5;

    const x1 = this.toSvgX(-0.83);
    const x2 = this.toSvgX(0.83);
    const y1 = this.toSvgY(szTop);
    const y2 = this.toSvgY(szBottom);
    return { x: Math.min(x1,x2), y: Math.min(y1,y2), w: Math.abs(x2-x1), h: Math.abs(y2-y1) };
  }

  /** All play events for the current at-bat */
  private get currentAtBatEvents(): any[] {
    const play = this.liveFeed?.liveData?.plays?.currentPlay;
    if (!play) return [];
    return (play.playEvents ?? []).filter((e: any) => e.isPitch);
  }

  /** Pitches plotted on the zone, most recent last (drawn on top) */
  get zonePitches(): ZonePitch[] {
    const events = this.currentAtBatEvents;
    if (!events.length) return [];

    return events.map((e: any, i: number) => {
      const pd   = e.pitchData ?? {};
      const coords = pd.coordinates ?? {};
      const pX   = coords.pX ?? null;
      const pZ   = coords.pZ ?? null;
      if (pX === null || pZ === null) return null;

      const code = e.details?.code ?? '';
      return {
        cx:        this.toSvgX(pX),
        cy:        this.toSvgY(pZ),
        callCode:  code,
        label:     this.pitchCallLabel(code),
        speed:     pd.startSpeed ?? undefined,
        pitchType: e.details?.type?.description ?? undefined,
        num:       e.pitchNumber ?? (i + 1),
        isCurrent: i === events.length - 1,
      } as ZonePitch;
    }).filter(Boolean) as ZonePitch[];
  }

  pitchDotClass(p: ZonePitch): string {
    const code = p.callCode;
    if (['B','I','P','V'].includes(code)) return 'dot-ball';
    if (code === 'X')                     return 'dot-inplay';
    if (['C','S','F','T','L','O','M','Q','R'].includes(code)) return 'dot-strike';
    return 'dot-other';
  }

  /** Current batter from live feed */
  get currentBatter(): any {
    return this.liveFeed?.liveData?.plays?.currentPlay?.matchup?.batter ?? null;
  }

  /** Current pitcher from live feed */
  get currentPitcher(): any {
    return this.liveFeed?.liveData?.plays?.currentPlay?.matchup?.pitcher ?? null;
  }

  /** Batter stance (L/R) */
  get batterSide(): string {
    return this.liveFeed?.liveData?.plays?.currentPlay?.matchup?.batSide?.code ?? '';
  }

  /** Pitcher hand (L/R) */
  get pitcherHand(): string {
    return this.liveFeed?.liveData?.plays?.currentPlay?.matchup?.pitchHand?.code ?? '';
  }

  /** Count from the linescore */
  get count(): { balls: number; strikes: number; outs: number } {
    return {
      balls:   this.ls.balls   ?? 0,
      strikes: this.ls.strikes ?? 0,
      outs:    this.ls.outs    ?? 0,
    };
  }

  countArray(n: number): number[] { return Array.from({ length: n }, (_, i) => i); }

  get svgWidth():  number { return this.SVG_W; }
  get svgHeight(): number { return this.SVG_H; }

  // ── Lineup building ─────────────────────────────────────────
  getLineupSlots(teamBs: any): LineupSlot[] {
    if (!teamBs?.batters) return [];
    const players = teamBs.batters
      .map((id: number) => teamBs.players?.[`ID${id}`])
      .filter((p: any) => !!p && p.position?.code !== '1');

    const slotMap = new Map<number, any[]>();
    for (const p of players) {
      const order   = p.battingOrder ?? 0;
      const slotNum = Math.floor(order / 100);
      if (!slotMap.has(slotNum)) slotMap.set(slotNum, []);
      slotMap.get(slotNum)!.push(p);
    }

    const slots: LineupSlot[] = [];
    const sortedKeys = [...slotMap.keys()].sort((a, b) => a - b);
    for (const key of sortedKeys) {
      const group = slotMap.get(key)!.sort((a: any, b: any) =>
        (a.battingOrder ?? 0) - (b.battingOrder ?? 0)
      );
      slots.push({ lineupNum: key > 0 ? key : 0, starter: group[0], subs: group.slice(1) });
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
  gameBat(p: any, field: string): string | number { return p?.stats?.batting?.[field] ?? ''; }
  seasonBat(p: any, field: string): string        { return p?.seasonStats?.batting?.[field] ?? '—'; }
  gamePit(p: any, field: string): string | number { return p?.stats?.pitching?.[field] ?? ''; }
  seasonPit(p: any, field: string): string        { return p?.seasonStats?.pitching?.[field] ?? '—'; }

  openPlayer(player: any) {
    const id = player?.person?.id ?? player?.id;
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

      const pitches: PitchEvent[] = (play.pitchIndex ?? []).map((pi: number) => {
        const pe = play.playEvents?.[pi] ?? {};
        const details = pe.details ?? {};
        const code = details.code ?? '';
        return {
          num: pe.pitchNumber ?? (pi + 1),
          description: details.description ?? '',
          speed: pe.pitchData?.startSpeed ?? undefined,
          callCode: code,
          isBall:   ['B','I','P','V'].includes(code),
          isStrike: ['C','S','F','T','L','O','M','Q','R'].includes(code),
          isInPlay: code === 'X',
        };
      });

      const eventType = result.eventType ?? result.event ?? '';
      let resultType: PlayEvent['resultType'] = 'other';
      if      (/strikeout/i.test(eventType))                           resultType = 'strikeout';
      else if (/home.run/i.test(eventType))                            resultType = 'homerun';
      else if (/walk|intent/i.test(eventType))                         resultType = 'walk';
      else if (/single|double|triple/i.test(eventType))                resultType = 'hit';
      else if (/out|fly|ground|line|pop|force|field/i.test(eventType)) resultType = 'out';
      else if (/score|run/i.test(eventType))                           resultType = 'run';

      return {
        inning, half: halfStr as 'Top' | 'Bottom',
        inningLabel: `${halfStr === 'Top' ? '▲' : '▼'} ${this.toOrdinal(inning)}`,
        description: result.description ?? '',
        result: result.event ?? '',
        resultType, pitches,
        awayScore: about.awayScore,
        homeScore: about.homeScore,
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

  formatSpeed(speed?: number): string {
    return speed != null ? speed.toFixed(1) + ' mph' : '';
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