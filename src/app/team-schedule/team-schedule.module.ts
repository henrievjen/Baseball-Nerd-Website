import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TeamScheduleRoutingModule } from './team-schedule-routing.module';
import { TeamScheduleComponent } from './team-schedule/team-schedule.component';

@NgModule({
  declarations: [TeamScheduleComponent],
  imports: [CommonModule, TeamScheduleRoutingModule]
})
export class TeamScheduleModule {}

