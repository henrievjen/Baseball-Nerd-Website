import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TeamDataService } from '../../shared/team-data.service';

@Component({
  selector: 'app-score-card',
  templateUrl: './score-card.component.html',
  styleUrls: ['./score-card.component.scss']
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
    const half = this.ls.inningHalf;
    const ord  = this.ls.currentInningOrdinal || '';
    const arrow = half === 'Top' ? '▲' : half === 'Bottom' ? '▼' : '';
    return `${arrow} ${ord}`.trim();
  }

  get gameTime(): string {
    if (this.game?.status?.startTimeTBD) return 'TBD';
    const d = this.game?.gameDate ? new Date(this.game.gameDate) : null;
    return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
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
      result.push(inn || { num: i, away: { runs: '' }, home: { runs: '' } });
    }
    return result;
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
