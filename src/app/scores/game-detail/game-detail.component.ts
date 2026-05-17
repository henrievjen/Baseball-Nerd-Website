import { Component, Input, Output, EventEmitter, HostListener, OnChanges, SimpleChanges, ChangeDetectionStrategy, OnInit, OnDestroy, Renderer2, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
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
  atBatIndex?: number;
}

export interface PitchEvent {
  num: number;
  description: string;
  speed?: number;
  callCode: string;
  isBall: boolean;
  isStrike: boolean;
  isInPlay: boolean;
  callClass: string;
  callLabel: string;
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
  dotClass: string;
}

@Component({
  selector: 'app-game-detail',
  templateUrl: './game-detail.component.html',
  styleUrl: './game-detail.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameDetailComponent implements OnInit, OnDestroy, OnChanges {
  @Input() game: any;
  @Input() boxscore: any;
  @Input() loading = false;
  @Input() plays: any = null;
  @Input() loadingPlays = false;
  @Input() liveFeed: any = null;
  @Output() closed = new EventEmitter<void>();

  mainTab: 'lineups' | 'plays' = 'lineups';

  // Cached data to avoid expensive re-calculations in getters
  cachedParsedPlays: PlayEvent[] = [];
  cachedAwayLineup: LineupSlot[] = [];
  cachedHomeLineup: LineupSlot[] = [];
  cachedAwayPitchers: any[] = [];
  cachedHomePitchers: any[] = [];
  cachedZonePitches: ZonePitch[] = [];
  cachedSzRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    public teams: TeamDataService,
    private playerSvc: PlayerService,
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit() {
    this.renderer.addClass(this.document.body, 'modal-open');
  }

  ngOnDestroy() {
    this.renderer.removeClass(this.document.body, 'modal-open');
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.closed.emit(); }

  closeOnOverlay(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closed.emit();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['boxscore'] || changes['plays']) {
      if (!this.boxscore && !this.plays) this.mainTab = 'lineups';
    }

    if (changes['plays']) {
      this.cachedParsedPlays = this.parsePlays();
    }

    if (changes['boxscore']) {
      this.cachedAwayLineup = this.buildLineupSlots(this.boxscore?.teams?.away);
      this.cachedHomeLineup = this.buildLineupSlots(this.boxscore?.teams?.home);
      this.cachedAwayPitchers = this.buildPitchers(this.boxscore?.teams?.away);
      this.cachedHomePitchers = this.buildPitchers(this.boxscore?.teams?.home);
    }

    if (changes['liveFeed'] || changes['game']) {
      this.updateStrikeZone();
    }
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

  get ls()          { return this.liveFeed?.liveData?.linescore || this.game?.linescore || {}; }
  get inningLabel() {
    const half  = this.ls.inningHalf;
    const arrow = half === 'Top' ? '▲' : half === 'Bottom' ? '▼' : '';
    return `${arrow} ${this.ls.currentInningOrdinal || ''}`.trim();
  }
  get innings()   { return this.ls.innings || []; }

  get displayInnings() {
    const current = this.ls.innings || [];
    const count = Math.max(9, current.length);
    const result = [];
    for (let i = 1; i <= count; i++) {
      const inn = current.find((x: any) => x.num === i);
      if (inn) {
        result.push(inn);
      } else {
        result.push({ num: i, away: {}, home: {}, _padded: true });
      }
    }
    return result;
  }

  get awayLineR() { return this.ls.teams?.away?.runs  ?? (this.state === 'upcoming' ? '' : 0); }
  get homeLineR() { return this.ls.teams?.home?.runs  ?? (this.state === 'upcoming' ? '' : 0); }
  get awayLineH() { return this.ls.teams?.away?.hits  ?? (this.state === 'upcoming' ? '' : 0); }
  get homeLineH() { return this.ls.teams?.home?.hits  ?? (this.state === 'upcoming' ? '' : 0); }
  get awayLineE() { return this.ls.teams?.away?.errors ?? (this.state === 'upcoming' ? '' : 0); }
  get homeLineE() { return this.ls.teams?.home?.errors ?? (this.state === 'upcoming' ? '' : 0); }

  get runners() {
    return {
      first:  !!this.ls.offense?.first?.id,
      second: !!this.ls.offense?.second?.id,
      third:  !!this.ls.offense?.third?.id
    };
  }

  getInningRuns(inn: any, team: 'away' | 'home'): string {
    const val = inn[team]?.runs;
    if (val !== undefined && val !== null && val !== '') {
      return val.toString();
    }
    if (inn._padded) return '';
    if (this.state === 'final') return 'x';
    return '';
  }

  // ── Live strikezone ─────────────────────────────────────────
  private readonly SVG_W   = 300;
  private readonly SVG_H   = 340;
  private readonly PAD     = 40;

  private toSvgX(pX: number): number {
    const rangeX = 3.2;
    const drawW  = this.SVG_W - this.PAD * 2;
    return this.PAD + drawW * (1 - (pX + rangeX / 2) / rangeX);
  }

  private toSvgY(pZ: number): number {
    const maxZ  = 5.0;
    const drawH = this.SVG_H - this.PAD * 2;
    return this.PAD + drawH * (1 - pZ / maxZ);
  }

  private updateStrikeZone() {
    const play = this.liveFeed?.liveData?.plays?.currentPlay;
    if (!play) {
      this.cachedZonePitches = [];
      this.cachedSzRect = { x: this.toSvgX(0.83), y: this.toSvgY(3.5), w: Math.abs(this.toSvgX(0.83) - this.toSvgX(-0.83)), h: Math.abs(this.toSvgY(3.5) - this.toSvgY(1.5)) };
      return;
    }

    const events = this.getAtBatEvents(play);

    // Update rect
    const szTop    = events.length
      ? (events.find((e: any) => e.pitchData?.strikeZoneTop)?.pitchData?.strikeZoneTop ?? 3.5)
      : 3.5;
    const szBottom = events.length
      ? (events.find((e: any) => e.pitchData?.strikeZoneBottom)?.pitchData?.strikeZoneBottom ?? 1.5)
      : 1.5;

    const x1 = this.toSvgX(-0.83);
    const x2 = this.toSvgX(0.83);
    const y1 = this.toSvgY(szTop);
    const y2 = this.toSvgY(szBottom);
    this.cachedSzRect = { x: Math.min(x1,x2), y: Math.min(y1,y2), w: Math.abs(x2-x1), h: Math.abs(y2-y1) };

    // Update pitches
    this.cachedZonePitches = events.map((e: any, i: number) => {
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
        dotClass:  this.getPitchDotClass(code)
      } as ZonePitch;
    }).filter(Boolean) as ZonePitch[];
  }

  private getAtBatEvents(play: any): any[] {
    if (!play || !play.playEvents) return [];
    if (play.pitchIndex && Array.isArray(play.pitchIndex)) {
      return play.pitchIndex.map((idx: number) => play.playEvents[idx]).filter((e: any) => !!e);
    }
    return play.playEvents.filter((e: any) => e.isPitch || e.type === 'pitch');
  }

  private getPitchDotClass(code: string): string {
    if (['B','I','P','V'].includes(code)) return 'dot-ball';
    if (code === 'X')                     return 'dot-inplay';
    if (['C','S','F','T','L','O','M','Q','R'].includes(code)) return 'dot-strike';
    return 'dot-other';
  }

  get currentBatter(): any {
    return this.liveFeed?.liveData?.plays?.currentPlay?.matchup?.batter || this.ls?.offense?.batter || null;
  }

  get currentPitcher(): any {
    return this.liveFeed?.liveData?.plays?.currentPlay?.matchup?.pitcher || this.ls?.defense?.pitcher || null;
  }

  get batterSide(): string {
    const side = this.liveFeed?.liveData?.plays?.currentPlay?.matchup?.batSide?.code;
    if (side) return side;
    const batterId = this.currentBatter?.id;
    if (batterId) {
      const p = this.awayBs?.players?.[`ID${batterId}`] || this.homeBs?.players?.[`ID${batterId}`];
      if (p?.person?.batSide?.code) return p.person.batSide.code;
    }
    return '';
  }

  get pitcherHand(): string {
    const hand = this.liveFeed?.liveData?.plays?.currentPlay?.matchup?.pitchHand?.code;
    if (hand) return hand;
    const pitcherId = this.currentPitcher?.id;
    if (pitcherId) {
      const p = this.awayBs?.players?.[`ID${pitcherId}`] || this.homeBs?.players?.[`ID${pitcherId}`];
      if (p?.person?.pitchHand?.code) return p.person.pitchHand.code;
    }
    return '';
  }

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
  private buildLineupSlots(teamBs: any): LineupSlot[] {
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

  private buildPitchers(teamBs: any): any[] {
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
  private parsePlays(): PlayEvent[] {
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
          isStrike: ['C','S','F','T','L','0','M','Q','R'].includes(code),
          isInPlay: code === 'X',
          callClass: this.getPitchCallClass(code),
          callLabel: this.pitchCallLabel(code)
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
        atBatIndex: play.atBatIndex
      };
    });

    return events.reverse();
  }

  private toOrdinal(n: number): string {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  private getPitchCallClass(code: string): string {
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

  getPitcherRecord(pitcher: any): string {
    if (!pitcher?.stats) return '';
    const seasonStats = pitcher.stats.find((s: any) =>
      s.type?.displayName?.toLowerCase().includes('season') &&
      s.group?.displayName?.toLowerCase().includes('pitching')
    );
    const stat = seasonStats?.splits?.[0]?.stat || seasonStats?.stats;
    if (stat && stat.wins !== undefined && stat.losses !== undefined) {
      return ` (${stat.wins}-${stat.losses})`;
    }
    return '';
  }

  // TrackBy functions for better performance
  trackByPlay(index: number, play: PlayEvent) { return play.atBatIndex || index; }
  trackByPitch(index: number, pitch: PitchEvent) { return pitch.num; }
  trackBySlot(index: number, slot: LineupSlot) { return slot.lineupNum || index; }
  trackByPlayer(index: number, player: any) { return player?.person?.id || index; }
  trackByInning(index: number, inn: any) { return inn.num; }
  trackByZonePitch(index: number, p: ZonePitch) { return p.num; }
}
