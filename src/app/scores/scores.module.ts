import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScoresRoutingModule } from './scores-routing.module';
import { ScoresComponent } from './scores/scores.component';
import { ScoreCardComponent } from './score-card/score-card.component';
import { GameDetailComponent } from './game-detail/game-detail.component';

@NgModule({
  declarations: [ScoresComponent, ScoreCardComponent, GameDetailComponent],
  imports: [CommonModule, ScoresRoutingModule]
})
export class ScoresModule {}
