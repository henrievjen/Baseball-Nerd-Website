import { Component, Input, Output, EventEmitter, HostListener, OnChanges } from '@angular/core';
import { TeamDataService } from '../../shared/team-data.service';
import { PlayerService } from '../../shared/player.service';

export interface PlayEvent {
  inning: number;
  half: 'Top' | 'Bottom';
  inningLabel: string;
  description: string;
  result: string;
  resultType: 'out' | 'hit' | 'run' | 'walk' | 'strikeout' | 'homerun' | 'other';
  pitches: PitchEvent[];
  runnersAfter: string;
  awayScore?: number;
  homeScore?: number;
}

export interface PitchEvent {
  num: number;
  description: string;
  type: string;          // B, S, X, etc.
  speed?: number;
  zone?: number;
  callCode: string;
  isBall: boolean;
  isStrike: boolean;
  isInPlay: boolean;
}

@Component({
  selector: 'app-game-detail',
  templateUrl: './game-detail.component.html',
  styleUrls: ['./game-detail.component.scss']
})
export class GameDetailComponent implements OnChanges {
  @Input() game: any;
  @Input() boxscore: any;
  @Input() loading = false;
  @Input() plays: any = null;
  @Input() loadingPlays = false;
  @Output() closed = new EventEmitter<void>();

  /** Top-level tabs */
  mainTab: 'lineups' | 'plays' = 'lineups';

  constructor(public teams: TeamDataService, private playerSvc: PlayerService) {}

  @HostListener('document:keydown.escape')
  onEscape() { this.closed.emit(); }

  closeOnOverlay(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closed.emit();
  }

  ngOnChanges() {
    // Reset to lineups tab whenever a new game is opened
    if (!this.boxscore && !this.plays) this.mainTab = 'lineups';
  }

  // ── Game state ─────────────────────────────────────
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

  // ── Lineups ────────────────────────────────────────
  getBatters(teamBs: any): any[] {
    if (!teamBs?.batters) return [];
    return teamBs.batters
      .map((id: number) => teamBs.players?.[`ID${id}`])
      .filter((p: any) => !!p);
  }

  getPitchers(teamBs: any): any[] {
    if (!teamBs?.pitchers) return [];
    return teamBs.pitchers
      .map((id: number) => teamBs.players?.[`ID${id}`])
      .filter((p: any) => !!p);
  }

  b(p: any, field: string): string | number {
    return p?.stats?.batting?.[field] ?? '';
  }
  pit(p: any, field: string): string | number {
    return p?.stats?.pitching?.[field] ?? '';
  }
  pitG(p: any, field: string): string | number {
    return p?.gameStats?.pitching?.[field] ?? p?.stats?.pitching?.[field] ?? '';
  }

  openPlayer(player: any) {
    const id = player?.person?.id;
    if (id) this.playerSvc.openPlayer(id);
  }

  logoError(ev: Event) { (ev.target as HTMLImageElement).style.display = 'none'; }

  // ── Play-by-Play ───────────────────────────────────
  get parsedPlays(): PlayEvent[] {
    const allPlays: any[] = this.plays?.allPlays ?? [];
    if (!allPlays.length) return [];

    const HALF_LABELS: Record<number, string> = {};

    const events: PlayEvent[] = allPlays.map((play: any) => {
      const about     = play.about ?? {};
      const result    = play.result ?? {};
      const inning    = about.inning ?? 0;
      const halfStr   = about.halfInning === 'top' ? 'Top' : 'Bottom';
      const ordinal   = this.toOrdinal(inning);
      const inningLabel = `${halfStr === 'Top' ? '▲' : '▼'} ${ordinal}`;

      // Pitches
      const pitches: PitchEvent[] = (play.pitchIndex ?? []).map((pi: number) => {
        const pe    = play.playEvents?.[pi] ?? {};
        const details = pe.details ?? {};
        const code  = details.code ?? '';
        return {
          num:         pe.pitchNumber ?? (pi + 1),
          description: details.description ?? '',
          type:        details.type?.code ?? '',
          speed:       pe.pitchData?.startSpeed ?? undefined,
          zone:        pe.pitchData?.zone ?? undefined,
          callCode:    code,
          isBall:      ['B','I','P','V'].includes(code),
          isStrike:    ['C','S','F','T','L','O','M','Q','R'].includes(code),
          isInPlay:    code === 'X',
        } as PitchEvent;
      });

      // Result type classification
      const eventType = result.eventType ?? result.event ?? '';
      let resultType: PlayEvent['resultType'] = 'other';
      if (/strikeout/i.test(eventType))                  resultType = 'strikeout';
      else if (/home.run/i.test(eventType))               resultType = 'homerun';
      else if (/walk|intent/i.test(eventType))            resultType = 'walk';
      else if (/single|double|triple/i.test(eventType))  resultType = 'hit';
      else if (/out|fly|ground|line|pop|force|field/i.test(eventType)) resultType = 'out';
      else if (/score|run/i.test(eventType))              resultType = 'run';

      // Runners after play
      const runners = (play.runners ?? [])
        .filter((r: any) => r.details?.isOut !== true && r.movement?.end && r.movement.end !== '4B')
        .map((r: any) => r.movement?.end ?? '');
      const baseFill = ['1B','2B','3B'].map(b => runners.includes(b) ? '●' : '○').join(' ');

      return {
        inning,
        half: halfStr as 'Top' | 'Bottom',
        inningLabel,
        description:  result.description ?? play.result?.description ?? '',
        result:       result.event ?? '',
        resultType,
        pitches,
        runnersAfter: baseFill,
        awayScore:    about.awayScore,
        homeScore:    about.homeScore,
      } as PlayEvent;
    });

    // Most recent first
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
    if (['S','C','F','T','L','O','M','Q','R'].includes(code)) return 'pitch-strike';
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