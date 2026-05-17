import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { TeamDataService } from '../../shared/team-data.service';
import { PlayerService } from '../../shared/player.service';

@Component({
  selector: 'app-game-detail',
  templateUrl: './game-detail.component.html',
  styleUrls: ['./game-detail.component.scss']
})
export class GameDetailComponent {
  @Input() game: any;
  @Input() boxscore: any;
  @Input() loading = false;
  @Output() closed = new EventEmitter<void>();

  activeTab: 'away' | 'home' | 'pitching' = 'away';

  constructor(public teams: TeamDataService, private playerSvc: PlayerService) {}

  @HostListener('document:keydown.escape')
  onEscape() { this.closed.emit(); }

  closeOnOverlay(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closed.emit();
  }

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
    const half = this.ls.inningHalf;
    const arrow = half === 'Top' ? '▲' : half === 'Bottom' ? '▼' : '';
    return `${arrow} ${this.ls.currentInningOrdinal || ''}`.trim();
  }

  get innings()    { return this.ls.innings || []; }
  get awayLineR()  { return this.ls.teams?.away?.runs ?? ''; }
  get homeLineR()  { return this.ls.teams?.home?.runs ?? ''; }
  get awayLineH()  { return this.ls.teams?.away?.hits ?? ''; }
  get homeLineH()  { return this.ls.teams?.home?.hits ?? ''; }
  get awayLineE()  { return this.ls.teams?.away?.errors ?? ''; }
  get homeLineE()  { return this.ls.teams?.home?.errors ?? ''; }

  getBatters(teamBs: any) {
    if (!teamBs?.batters) return [];
    return teamBs.batters
      .map((id: number) => teamBs.players?.[`ID${id}`])
      .filter((p: any) => !!p);
  }

  getPitchers(teamBs: any) {
    if (!teamBs?.pitchers) return [];
    return teamBs.pitchers
      .map((id: number) => teamBs.players?.[`ID${id}`])
      .filter((p: any) => !!p);
  }

  openPlayer(player: any) {
    const id = player?.person?.id;
    if (id) this.playerSvc.openPlayer(id);
  }

  logoError(ev: Event) { (ev.target as HTMLImageElement).style.display = 'none'; }
}
