import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TeamDataService } from '../../shared/team-data.service';

@Component({
  selector: 'app-score-card',
  templateUrl: './score-card.component.html',
  styleUrl: './score-card.component.scss',
  standalone: false
})
export class ScoreCardComponent {
  @Input() game: any;
  @Output() gameSelected = new EventEmitter<any>();

  constructor(public teams: TeamDataService) {}

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
        // Padded inning
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
    // If it's a padded inning (beyond what's in the linescore), leave blank
    if (inn._padded) return '';

    // If game is final and we have an inning object but no runs for this half, show 'x'
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

  logoError(ev: Event, teamId: number) {
    (ev.target as HTMLImageElement).style.display = 'none';
  }
}
