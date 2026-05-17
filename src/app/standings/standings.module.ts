import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StandingsRoutingModule } from './standings-routing.module';
import { StandingsComponent } from './standings/standings.component';

@NgModule({
  declarations: [StandingsComponent],
  imports: [CommonModule, StandingsRoutingModule]
})
export class StandingsModule {}
