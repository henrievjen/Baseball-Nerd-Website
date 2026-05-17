import { Component, OnInit, HostListener } from '@angular/core';
import { PlayerService } from '../../shared/player.service';
import { MlbApiService } from '../../shared/mlb-api.service';
import { TeamDataService } from '../../shared/team-data.service';

@Component({
  selector: 'app-player-modal',
  templateUrl: './player-modal.component.html',
  styleUrls: ['./player-modal.component.scss']
})
export class PlayerModalComponent implements OnInit {
  player: any = null;
  loading = false;
  error = false;
  activeTab: 'hitting-season' | 'hitting-career' | 'pitching-season' | 'pitching-career' = 'hitting-season';

  constructor(
    private playerSvc: PlayerService,
    private api: MlbApiService,
    public teams: TeamDataService
  ) {}

  ngOnInit() {
    this.playerSvc.openPlayer$.subscribe(id => this.load(id));
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.close(); }

  load(id: number) {
    this.loading = true; this.error = false; this.player = null;
    this.api.getPerson(id).subscribe({
      next: (data) => {
        this.player = data.people?.[0] ?? null;
        this.setDefaultTab();
        this.loading = false;
      },
      error: () => { this.error = true; this.loading = false; }
    });
  }

  setDefaultTab() {
    if (!this.player) return;
    const isPitcher = this.player.primaryPosition?.code === '1';
    this.activeTab = isPitcher ? 'pitching-season' : 'hitting-season';
  }

  close() { this.player = null; this.loading = false; }

  closeOnOverlay(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.close();
  }

  get teamId()  { return this.player?.currentTeam?.id; }
  get isPitcher() { return this.player?.primaryPosition?.code === '1'; }

  getStats(group: string, type: string) {
    return this.player?.stats?.find((s: any) =>
      s.type?.displayName?.toLowerCase().includes(type) &&
      s.group?.displayName?.toLowerCase().includes(group)
    )?.splits?.[0]?.stat;
  }

  get hitSeason()  { return this.getStats('hitting',  'season'); }
  get hitCareer()  { return this.getStats('hitting',  'career'); }
  get pitSeason()  { return this.getStats('pitching', 'season'); }
  get pitCareer()  { return this.getStats('pitching', 'career'); }

  get birthDateFormatted() {
    if (!this.player?.birthDate) return '';
    return new Date(this.player.birthDate + 'T00:00:00').toLocaleDateString([], {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  photoError(ev: Event) { (ev.target as HTMLImageElement).style.opacity = '0'; }
  logoError(ev: Event)  { (ev.target as HTMLImageElement).style.display = 'none'; }
}
