import { Component, Input, Output, EventEmitter, HostListener, OnChanges, SimpleChanges, ChangeDetectionStrategy, OnInit, OnDestroy, Renderer2, Inject, ChangeDetectorRef } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { TeamDataService } from '../../shared/team-data.service';
import { PlayerService } from '../../shared/player.service';
import { MlbApiService } from '../../shared/mlb-api.service';

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
  resultType: 'out' | 'hit' | 'run' | 'walk' | 'strikeout' | 'homerun' | 'other' | 'inprogress';
  pitches: PitchEvent[];
  awayScore?: number;
  homeScore?: number;
  atBatIndex?: number;
  inProgress?: boolean;
  batterName?: string;
  pitcherName?: string;
  isScoringPlay?: boolean;
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
  /** Pitch type description, e.g. "4-Seam Fastball" */
  pitchType?: string;
  /** Result of this specific pitch e.g. "Ball", "Called Strike", "In play, run(s)" */
  result?: string;
  /** Count after this pitch */
  balls?: number;
  strikes?: number;
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
  @Input() makeupGame: any = null;
  @Output() closed = new EventEmitter<void>();

  mainTab: 'lineups' | 'plays' = 'lineups';

  /** Plays sub-filter: show all plays vs. only scoring plays */
  playsFilter: 'all' | 'scoring' = 'all';

  setPlaysFilter(f: 'all' | 'scoring') {
    if (this.playsFilter === f) return;
    this.playsFilter = f;
    this.expandedPlayIdx = null;
  }

  get filteredPlays(): PlayEvent[] {
    if (this.playsFilter === 'scoring') {
      return this.cachedParsedPlays.filter(p => p.isScoringPlay);
    }
    return this.cachedParsedPlays;
  }

  get scoringPlaysCount(): number {
    return this.cachedParsedPlays.filter(p => p.isScoringPlay).length;
  }


  /** atBatIndex of the currently expanded play card (null = collapsed). */
  expandedPlayIdx: number | null = null;

  togglePlay(play: PlayEvent) {
    const id = play.atBatIndex;
    if (id == null) return;
    this.expandedPlayIdx = this.expandedPlayIdx === id ? null : id;
  }

  // Cached data to avoid expensive re-calculations in getters
  cachedParsedPlays: PlayEvent[] = [];
  cachedAwayLineup: LineupSlot[] = [];
  cachedHomeLineup: LineupSlot[] = [];
  cachedAwayPitchers: any[] = [];
  cachedHomePitchers: any[] = [];
  cachedZonePitches: ZonePitch[] = [];
  cachedSzRect = { x: 0, y: 0, w: 0, h: 0 };

  /** Cache of probable pitcher season pitching stats by player id (fetched on demand) */
  private probablePitcherStats: Record<number, any> = {};
  private probablePitcherFetching: Record<number, boolean> = {};

  constructor(
    public teams: TeamDataService,
    private playerSvc: PlayerService,
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document,
    private api: MlbApiService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  goToTeam(teamId?: number) {
    if (!teamId) return;
    this.closed.emit();
    this.router.navigate(['/team-schedule', teamId]);
  }

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
    if (changes['plays']) {
      this.cachedParsedPlays = this.parsePlays();
    }

    if (changes['boxscore']) {
      this.cachedAwayLineup = this.buildLineupSlots(this.boxscore?.teams?.away);
      this.cachedHomeLineup = this.buildLineupSlots(this.boxscore?.teams?.home);
      this.cachedAwayPitchers = this.buildPitchers(this.boxscore?.teams?.away);
      this.cachedHomePitchers = this.buildPitchers(this.boxscore?.teams?.home);
    }

    if (changes['liveFeed'] || changes['game'] || changes['plays']) {
      this.updateStrikeZone();
    }

    // Default to 'plays' for live games when they first load
    if (this.state === 'live' && this.playsAvailable && changes['game'] && !changes['game'].previousValue) {
      this.mainTab = 'plays';
    }

    if (changes['game']) {
      this.fetchProbablePitcherStatsIfNeeded(this.away?.probablePitcher);
      this.fetchProbablePitcherStatsIfNeeded(this.home?.probablePitcher);
    }
  }

  private fetchProbablePitcherStatsIfNeeded(pitcher: any) {
    const id = pitcher?.id;
    if (!id) return;
    if (this.probablePitcherStats[id] || this.probablePitcherFetching[id]) return;
    // If schedule hydration already provided stats, extract and cache immediately
    const inline = this.extractSeasonStat(pitcher);
    if (inline) {
      this.probablePitcherStats[id] = inline;
      return;
    }
    this.probablePitcherFetching[id] = true;
    const season = new Date().getFullYear();
    this.api.getPlayerStatsBySeason(id, season).subscribe({
      next: (resp: any) => {
        const stat = resp?.stats?.find((s: any) =>
          s.group?.displayName?.toLowerCase() === 'pitching' || s.group?.code === 'pitching'
        )?.splits?.[0]?.stat;
        if (stat) this.probablePitcherStats[id] = stat;
        this.probablePitcherFetching[id] = false;
        this.cdr.markForCheck();
      },
      error: () => { this.probablePitcherFetching[id] = false; }
    });
  }

  private extractSeasonStat(pitcher: any): any {
    if (!pitcher) return null;
    const candidates = [pitcher.stats, pitcher.person?.stats];
    for (const statsArray of candidates) {
      if (!Array.isArray(statsArray) || !statsArray.length) continue;
      const entry = statsArray.find((s: any) =>
        s.group?.displayName?.toLowerCase() === 'pitching' ||
        s.group?.code === 'pitching'
      ) ?? statsArray[0];
      if (!entry) continue;
      const stat = entry.splits?.[0]?.stat ?? entry.stats ?? null;
      if (stat) return stat;
    }
    return null;
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

  get isPostponed(): boolean {
    const status = this.game?.status;
    if (!status) return false;
    // codedGameState 'D' is the MLB API's definitive code for the original postponed entry.
    // detailedState 'Postponed' is a safety fallback.
    // We deliberately exclude 'Rescheduled' — the MLB API also sets that on the makeup game.
    const postponedStatus =
      status.codedGameState === 'D' ||
      status.detailedState === 'Postponed';
    if (!postponedStatus) return false;
    // The makeup game has rescheduledFrom set — never treat it as postponed.
    if (this.game?.rescheduledFrom) return false;
    return true;
  }

  /**
   * Human-readable label for the makeup game date.
   * Sources in priority order:
   *  1. rescheduleGameDate / rescheduleDate on the postponed game object (MLB API base fields)
   *  2. gameDate on a makeupGame found by schedule lookup
   */
  get makeupDateLabel(): string | null {
    // Priority 1: field on the postponed game itself
    const raw = this.game?.rescheduleGameDate || this.game?.rescheduleDate;
    if (raw) return this.formatMakeupDate(raw);

    // Priority 2: makeup game passed in from parent lookup
    if (this.makeupGame) {
      const d = this.makeupGame.gameDate || this.makeupGame.officialDate;
      if (d) return this.formatMakeupDate(d);
    }

    return null;
  }

  private formatMakeupDate(raw: string): string {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    // If the raw string is date-only (no time component) use UTC to avoid off-by-one
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim());
    const target = isDateOnly ? new Date(raw + 'T12:00:00Z') : d;
    return target.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
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
  private readonly SVG_W   = 280;
  private readonly SVG_H   = 400;
  private readonly PAD     = 40;

  private toSvgX(pX: number): number {
    const rangeX = 3.2; // Width of coverage area in feet
    const drawW  = this.SVG_W - this.PAD * 2;
    return this.PAD + drawW * (1 - (pX + rangeX / 2) / rangeX);
  }

  private toSvgY(pZ: number): number {
    const maxZ  = 5.0; // Height of coverage area in feet
    const drawH = this.SVG_H - this.PAD * 2;
    return this.PAD + drawH * (1 - pZ / maxZ);
  }

  private updateStrikeZone() {
    // Try currentPlay from liveFeed first, then fallback to last play in plays feed
    let play = this.liveFeed?.liveData?.plays?.currentPlay;
    if (!play && this.plays?.allPlays?.length) {
      play = this.plays.allPlays[this.plays.allPlays.length - 1];
    }

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

    const x1 = this.toSvgX(-0.83); // ~17 inches + ball radius
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
    if (!play) return [];
    const playEvts = play.playEvents || [];
    if (play.pitchIndex && Array.isArray(play.pitchIndex)) {
      return play.pitchIndex.map((idx: number) => playEvts[idx]).filter((e: any) => !!e);
    }
    return playEvts.filter((e: any) => e.isPitch || e.type === 'pitch');
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

  get currentBatterNumber(): string {
    const id = this.currentBatter?.id;
    if (!id) return '';
    const p = this.awayBs?.players?.[`ID${id}`] || this.homeBs?.players?.[`ID${id}`];
    return p?.jerseyNumber || '';
  }

  get currentPitcherNumber(): string {
    const id = this.currentPitcher?.id;
    if (!id) return '';
    const p = this.awayBs?.players?.[`ID${id}`] || this.homeBs?.players?.[`ID${id}`];
    return p?.jerseyNumber || '';
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
      if (!slotNum) continue;
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

      const playEvts = play.playEvents || [];
      const pitches: PitchEvent[] = (play.pitchIndex && Array.isArray(play.pitchIndex))
        ? play.pitchIndex.map((pi: number) => {
            const pe = playEvts[pi] || {};
            const details = pe.details || {};
            const code = details.code || '';
            return {
              num: pe.pitchNumber || (pi + 1),
              description: details.description || '',
              speed: pe.pitchData?.startSpeed || undefined,
              callCode: code,
              isBall:   ['B','I','P','V'].includes(code),
              isStrike: ['C','S','F','T','L','0','M','Q','R'].includes(code),
              isInPlay: code === 'X',
              callClass: this.getPitchCallClass(code),
              callLabel: this.pitchCallLabel(code),
              pitchType: details.type?.description || pe.pitchData?.typeConfidence || '',
              result:    details.description || '',
              balls:     pe.count?.balls,
              strikes:   pe.count?.strikes,
            };
          })
        : playEvts.filter((e: any) => e.isPitch || e.type === 'pitch').map((pe: any, pi: number) => {
            const details = pe.details || {};
            const code = details.code || '';
            return {
              num: pe.pitchNumber || (pi + 1),
              description: details.description || '',
              speed: pe.pitchData?.startSpeed || undefined,
              callCode: code,
              isBall:   ['B','I','P','V'].includes(code),
              isStrike: ['C','S','F','T','L','0','M','Q','R'].includes(code),
              isInPlay: code === 'X',
              callClass: this.getPitchCallClass(code),
              callLabel: this.pitchCallLabel(code),
              pitchType: details.type?.description || '',
              result:    details.description || '',
              balls:     pe.count?.balls,
              strikes:   pe.count?.strikes,
            };
          });

      const eventType = result.eventType ?? result.event ?? '';
      const isComplete = about.isComplete === true || !!eventType;
      const batterName = play.matchup?.batter?.fullName || '';
      const pitcherName = play.matchup?.pitcher?.fullName || '';

      let resultType: PlayEvent['resultType'] = 'other';
      let resultLabel = result.event ?? '';
      let descriptionLabel = result.description ?? '';

      if (!isComplete) {
        resultType = 'inprogress';
        resultLabel = 'AT BAT';
        if (batterName) {
          descriptionLabel = pitcherName
            ? `${batterName} batting vs. ${pitcherName}`
            : `${batterName} batting`;
        } else {
          descriptionLabel = 'At-bat in progress';
        }
      } else if (/strikeout/i.test(eventType))                           resultType = 'strikeout';
      else if (/home.run/i.test(eventType))                              resultType = 'homerun';
      else if (/walk|intent/i.test(eventType))                           resultType = 'walk';
      else if (/single|double|triple/i.test(eventType))                  resultType = 'hit';
      else if (/out|fly|ground|line|pop|force|field/i.test(eventType))   resultType = 'out';
      else if (/score|run/i.test(eventType))                             resultType = 'run';

      return {
        inning, half: halfStr as 'Top' | 'Bottom',
        inningLabel: `${halfStr === 'Top' ? '▲' : '▼'} ${this.toOrdinal(inning)}`,
        description: descriptionLabel,
        result: resultLabel,
        resultType, pitches,
        awayScore: about.awayScore,
        homeScore: about.homeScore,
        atBatIndex: play.atBatIndex,
        inProgress: !isComplete,
        batterName,
        pitcherName,
        isScoringPlay: about.isScoringPlay === true || (result.rbi ?? 0) > 0
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
      // Balls
      'B': 'Ball',
      'I': 'Intentional Ball',
      'P': 'Pitchout',
      'V': 'Automatic Ball',
      // Strikes
      'C': 'Called Strike',
      'S': 'Swinging Strike',
      'F': 'Foul',
      'T': 'Foul Tip',
      'L': 'Foul Bunt',
      'M': 'Missed Bunt',
      'O': 'Foul Tip Bunt',
      'Q': 'Swinging Pitchout',
      'R': 'Foul Pitchout',
      'K': 'Automatic Strike',
      // In play
      'X': 'In Play (out)',
      'D': 'In Play (no out)',
      'E': 'In Play (run)',
      // Hit by pitch
      'H': 'Hit by Pitch',
    };
    return labels[code] ?? code;
  }

  getPitcherRecord(pitcher: any): string {
    if (!pitcher) return '';
    const statsArray = pitcher.stats || pitcher.person?.stats;
    if (!statsArray || !Array.isArray(statsArray)) return '';

    const seasonStats = statsArray.find((s: any) =>
      (s.type?.displayName?.toLowerCase().includes('season') || s.type?.displayName?.toLowerCase() === 'stats') &&
      (s.group?.displayName?.toLowerCase() === 'pitching' || s.group?.code === 'pitching')
    );

    const stat = seasonStats?.stats || seasonStats?.splits?.[0]?.stat;
    if (stat && stat.wins !== undefined && stat.losses !== undefined) {
      return ` (${stat.wins}-${stat.losses})`;
    }
    return '';
  }

  private getProbablePitcherSeasonStat(pitcher: any): any {
    if (!pitcher) return null;
    // First, check the fetched cache by id
    if (pitcher.id && this.probablePitcherStats[pitcher.id]) {
      return this.probablePitcherStats[pitcher.id];
    }
    // Then fall back to any inline hydrated stats on the pitcher object
    return this.extractSeasonStat(pitcher);
  }

  getProbablePitcherRecord(pitcher: any): string {
    const stat = this.getProbablePitcherSeasonStat(pitcher);
    if (stat?.wins !== undefined && stat?.losses !== undefined) {
      return `${stat.wins}-${stat.losses}`;
    }
    return '—';
  }

  getProbablePitcherEra(pitcher: any): string {
    const stat = this.getProbablePitcherSeasonStat(pitcher);
    return stat?.era ?? '—';
  }

  getProbablePitcherWhip(pitcher: any): string {
    const stat = this.getProbablePitcherSeasonStat(pitcher);
    return stat?.whip ?? '—';
  }

  getProbablePitcherStrikeouts(pitcher: any): string | number {
    const stat = this.getProbablePitcherSeasonStat(pitcher);
    return stat?.strikeOuts ?? '—';
  }

  get lineupsAvailable(): boolean {
    return !!(this.awayBs?.batters?.length || this.homeBs?.batters?.length ||
              this.awayBs?.pitchers?.length || this.homeBs?.pitchers?.length);
  }

  get playsAvailable(): boolean {
    return !!(this.plays?.allPlays?.length);
  }

  get venueName() { return this.game?.venue?.name; }

  get homeTv() {
    return this.game?.broadcasts
      ?.filter((b: any) => b.type === 'TV' && b.homeAway === 'home')
      ?.map((b: any) => b.callSign)
      ?.join(', ');
  }

  get awayTv() {
    return this.game?.broadcasts
      ?.filter((b: any) => b.type === 'TV' && b.homeAway === 'away')
      ?.map((b: any) => b.callSign)
      ?.join(', ');
  }

  get isSameTv(): boolean {
    return !!this.homeTv && !!this.awayTv && this.homeTv === this.awayTv;
  }

  getTvArray(tvString: string): string[] {
    if (!tvString) return [];
    return tvString.split(',').map(s => s.trim());
  }

  getNetworkLogo(callSign: string): string | null {
    const c = callSign.toUpperCase();
    if (c == 'NBC') return 'assets/nbc.png';
    if (c == 'NBC/Peacock') return 'assets/nbc.png';
    if (c == 'NETFLIX') return 'assets/netflix.png';
    if (c == 'ABC') return 'assets/abc.png';
    if (c == 'ESPN') return 'assets/espn.png';
    if (c == 'FS1') return 'assets/fs1.png';
    if (c == 'Peacock') return 'assets/peacock.png';
    return null;
  }

  // ── Final-game info (attendance / duration / first pitch / weather) ──
  private get gameInfo(): any { return this.liveFeed?.gameData?.gameInfo ?? {}; }
  private get weatherData(): any { return this.liveFeed?.gameData?.weather ?? {}; }
  private get datetimeData(): any { return this.liveFeed?.gameData?.datetime ?? {}; }
  private get venueData(): any { return this.liveFeed?.gameData?.venue ?? this.game?.venue ?? {}; }

  get attendance(): string {
    const a = this.gameInfo?.attendance;
    return (typeof a === 'number') ? a.toLocaleString() : '';
  }

  /** Total elapsed game time formatted like "3:12" */
  get gameDuration(): string {
    const mins = this.gameInfo?.gameDurationMinutes;
    if (typeof mins !== 'number' || mins <= 0) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${m.toString().padStart(2, '0')}`;
  }

  /** First pitch time formatted in the venue's local timezone */
  get firstPitchLocal(): string {
    const iso = this.datetimeData?.firstPitch || this.datetimeData?.dateTime || this.game?.gameDate;
    if (!iso) return '';
    const tz = this.venueData?.timeZone?.id;
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: 'numeric', minute: '2-digit',
        timeZone: tz || undefined,
        timeZoneName: tz ? 'short' : undefined
      });
    } catch {
      return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
  }

  get weather(): string {
    const w = this.weatherData;
    if (!w || (!w.temp && !w.condition)) return '';
    const parts: string[] = [];
    if (w.temp) parts.push(`${w.temp}°F`);
    if (w.condition) parts.push(w.condition);
    if (w.wind) parts.push(`Wind: ${w.wind}`);
    return parts.join(' · ');
  }

  get isFinal(): boolean { return this.state === 'final'; }

  // TrackBy functions for better performance
  trackByPlay(index: number, play: PlayEvent) { return play.atBatIndex || index; }
  trackByPitch(index: number, pitch: PitchEvent) { return pitch.num; }
  trackBySlot(index: number, slot: LineupSlot) { return slot.lineupNum || index; }
  trackByPlayer(index: number, player: any) { return player?.person?.id || index; }
  trackByInning(index: number, inn: any) { return inn.num; }
  trackByZonePitch(index: number, p: ZonePitch) { return p.num; }
}