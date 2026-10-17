import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StandingsRoutingModule } from './standings-routing.module';
import { StandingsComponent } from './standings/standings.component';
import { BracketBoardComponent } from './bracket/bracket-board.component';

@NgModule({
  declarations: [StandingsComponent, BracketBoardComponent],
  imports: [CommonModule, StandingsRoutingModule]
})
export class StandingsModule {}
