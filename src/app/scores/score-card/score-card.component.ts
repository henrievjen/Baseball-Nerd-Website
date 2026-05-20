import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TeamDataService } from '../../shared/team-data.service';
import { PitcherRecordService } from '../../shared/pitcher-record.service';
import { FavoriteTeamsService } from '../../shared/favorite-teams.service';

@Component({
  selector: 'app-score-card',
  templateUrl: './score-card.component.html',
  styleUrl: './score-card.component.scss',
  standalone: false
})
export class ScoreCardComponent {
  @Input() game: any;
  @Input() hasLiveGames = false;
  @Output() gameSelected = new EventEmitter<any>();

  constructor(public teams: TeamDataService, private pitcherRecords: PitcherRecordService, public favoritesSvc: FavoriteTeamsService) {}

  isFavorite(teamId: number | undefined): boolean { return this.favoritesSvc.isFavorite(teamId); }

  toggleFavorite(event: MouseEvent, teamId: number | undefined) {
    event.stopPropagation();
    event.preventDefault();
    this.favoritesSvc.toggle(teamId);
  }

  get isFavoriteGame(): boolean {
    return this.isFavorite(this.awayId) || this.isFavorite(this.homeId);
  }

  get away() { return this.game?.teams?.away; }
  get home() { return this.game?.teams?.home; }
  get awayId() { return this.away?.team?.id; }
  get homeId() { return this.home?.team?.id; }
  get ls() { return this.game?.linescore || {}; }

  get state(): 'live' | 'final' | 'upcoming' {
    const s = this.game?.status?.abstractGameState;
    const d = this.game?.status?.detailedState || '';
    if (s === 'Live') return 'live';
    if (s === 'Final' || d.startsWith('Final')) return 'final';
    return 'upcoming';
  }

  get inningLabel(): string {
    const d = this.game?.status?.detailedState || '';
    if (d.includes('Delay') || d.includes('Delayed')) return 'DELAYED';
    if (d === 'Suspended') return 'SUSPENDED';

    const half = this.ls.inningHalf;
    const ord  = this.ls.currentInningOrdinal || '';
    const arrow = half === 'Top' ? '▲' : half === 'Bottom' ? '▼' : '';
    return `${arrow} ${ord}`.trim();
  }

  get gameTime(): string {
    const status = this.game?.status;
    const d = status?.detailedState || '';

    if (d === 'Postponed') return 'POSTPONED';
    if (d === 'Cancelled') return 'CANCELLED';
    if (d.includes('Delay') || d.includes('Delayed')) return 'DELAYED';
    if (d === 'Suspended') return 'SUSPENDED';

    if (status?.startTimeTBD) return 'TBD';
    const date = this.game?.gameDate ? new Date(this.game.gameDate) : null;
    return date ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  }

  get extraInnings(): string {
    const i = this.ls.currentInning;
    return (i && i !== 9) ? `/${i}` : '';
  }

  get awayWin() { return this.state === 'final' && (this.away?.score ?? 0) > (this.home?.score ?? 0); }
  get homeWin() { return this.state === 'final' && (this.home?.score ?? 0) > (this.away?.score ?? 0); }

  get runners() {
    return {
      first:  !!this.ls.offense?.first?.id,
      second: !!this.ls.offense?.second?.id,
      third:  !!this.ls.offense?.third?.id
    };
  }

  get innings() { return this.ls.innings || []; }

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

  getInningRuns(inn: any, team: 'away' | 'home'): string {
    const val = inn[team]?.runs;
    if (val !== undefined && val !== null && val !== '') {
      return val.toString();
    }
    if (inn._padded) return '';
    if (this.state === 'final') return 'x';
    return '';
  }

  get awayLineR() { return this.ls.teams?.away?.runs ?? 0; }
  get homeLineR() { return this.ls.teams?.home?.runs ?? 0; }
  get awayLineH() { return this.ls.teams?.away?.hits ?? 0; }
  get homeLineH() { return this.ls.teams?.home?.hits ?? 0; }
  get awayLineE() { return this.ls.teams?.away?.errors ?? 0; }
  get homeLineE() { return this.ls.teams?.home?.errors ?? 0; }

  get decisions() { return this.game?.decisions; }
  get winner() { return this.decisions?.winner; }
  get loser() { return this.decisions?.loser; }
  get save() { return this.decisions?.save; }

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

  // ─────────────────────────────────────────────────────────────
  // No-hitter / perfect game detection
  //
  // A team is being "no-hit" when the opposing pitching staff has allowed it
  // zero hits. Perfect game additionally requires zero baserunners — no walks,
  // no hit-batters, no errors, no reached-on-error. The schedule linescore
  // doesn't break out walks/HBP, but `leftOnBase` on a team is 0 only when
  // that team never had a baserunner — which mathematically implies no
  // hits + no walks + no HBP + no reached-on-error. Combined with the
  // opposing team's `errors === 0` we can detect a perfect game cleanly.
  //
  // For LIVE games we require at least 6 full innings to have been completed
  // before showing the badge.
  // ─────────────────────────────────────────────────────────────

  /** True when enough innings have been played to show no-hitter status live. */
  private get qualifiesForNoHitterDisplay(): boolean {
    if (this.state === 'final') return true;
    if (this.state !== 'live')  return false;
    const inn = this.ls.currentInning ?? 0;
    const st  = (this.ls.inningState || '').toString();
    // 6 full innings completed → currentInning is now 7+, OR we're at the
    // "End" of the 6th inning (transitioning to top of 7).
    if (inn >= 7) return true;
    if (inn === 6 && st === 'End') return true;
    return false;
  }

  /**
   * Returns no-hitter info for the game, or null if neither team is being no-hit.
   * `team` is the team currently being no-hit (offensive team with 0 hits).
   * `perfect` is true when no baserunners have reached at all.
   */
  get noHitter(): { team: 'away' | 'home'; perfect: boolean } | null {
    if (this.state === 'upcoming') return null;
    if (!this.qualifiesForNoHitterDisplay) return null;

    const a = this.ls.teams?.away;
    const h = this.ls.teams?.home;
    if (!a || !h) return null;

    // Must have actually played at least the top of the 1st (avoid showing
    // a no-hitter banner on a game that has barely started).
    const totalHits = (a.hits ?? 0) + (h.hits ?? 0);
    const totalRuns = (a.runs ?? 0) + (h.runs ?? 0);
    if (totalHits === 0 && totalRuns === 0 && this.state === 'live'
        && (this.ls.currentInning ?? 0) < 6) {
      return null;
    }

    const check = (
      offense: any, defense: any, who: 'away' | 'home'
    ): { team: 'away' | 'home'; perfect: boolean } | null => {
      if (offense.hits == null) return null;
      if (offense.hits !== 0) return null;
      const lob   = offense.leftOnBase ?? 0;
      const errs  = defense.errors    ?? 0;
      const perfect = lob === 0 && errs === 0;
      return { team: who, perfect };
    };

    return check(a, h, 'away') ?? check(h, a, 'home');
  }

  /** Convenience flag — true when either team is being no-hit. */
  get hasNoHitter(): boolean { return !!this.noHitter; }

  /** Convenience flag — true when either team is being perfect-gamed. */
  get hasPerfectGame(): boolean { return this.noHitter?.perfect === true; }

  /** Badge text to display (PERFECT GAME beats NO HITTER). */
  get noHitterLabel(): string {
    const nh = this.noHitter;
    if (!nh) return '';
    return nh.perfect ? 'PERFECT GAME' : 'NO HITTER';
  }

  /** True when the no-hitter / perfect game is in progress (live game). */
  get noHitterInProgress(): boolean { return this.hasNoHitter && this.state === 'live'; }

  getPitcherRecord(pitcher: any): string {
    return this.pitcherRecords.record(pitcher);
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

  logoError(ev: Event, teamId: number) {
    (ev.target as HTMLImageElement).style.display = 'none';
  }
}
