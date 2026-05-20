import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeamScheduleComponent } from './team-schedule/team-schedule.component';

const routes: Routes = [
  { path: '', component: TeamScheduleComponent },
  { path: ':teamId', component: TeamScheduleComponent }
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class TeamScheduleRoutingModule {}

