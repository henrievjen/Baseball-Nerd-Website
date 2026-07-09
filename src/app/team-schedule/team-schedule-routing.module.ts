import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeamScheduleComponent } from './team-schedule/team-schedule.component';

const routes: Routes = [
  { path: '', component: TeamScheduleComponent, title: 'MLB Team Schedules | Baseball Nerd' },
  { path: ':teamId', component: TeamScheduleComponent, title: 'MLB Team Schedule | Baseball Nerd' }
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class TeamScheduleRoutingModule {}

