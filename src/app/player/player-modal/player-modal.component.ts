import { Component, OnInit, OnDestroy, HostListener, Renderer2, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PlayerService } from '../../shared/player.service';
import { MlbApiService } from '../../shared/mlb-api.service';
import { TeamDataService } from '../../shared/team-data.service';

@Component({
  selector: 'app-player-modal',
  templateUrl: './player-modal.component.html',
  styleUrl: './player-modal.component.scss',
  standalone: false
})
export class PlayerModalComponent implements OnInit, OnDestroy {
  player: any = null;
  loading = false;
  error = false;
  activeTab: 'hitting-season' | 'hitting-career' | 'pitching-season' | 'pitching-career' = 'hitting-season';

  constructor(
    private playerSvc: PlayerService,
    private api: MlbApiService,
    public teams: TeamDataService,
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit() {
    this.playerSvc.openPlayer$.subscribe(id => {
      this.load(id);
      this.renderer.addClass(this.document.body, 'modal-open');
    });
  }

  ngOnDestroy() {
    this.renderer.removeClass(this.document.body, 'modal-open');
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

  close() {
    this.player = null;
    this.loading = false;
    this.renderer.removeClass(this.document.body, 'modal-open');
  }

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
