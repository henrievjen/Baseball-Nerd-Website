import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerModalComponent } from './player-modal/player-modal.component';

@NgModule({
  declarations: [PlayerModalComponent],
  imports: [CommonModule],
  exports: [PlayerModalComponent]
})
export class PlayerModule {}
