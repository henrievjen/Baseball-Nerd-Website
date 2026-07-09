import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StatsComponent } from './stats/stats.component';

const routes: Routes = [{ path: '', component: StatsComponent, title: 'MLB Player & Team Stat Leaders | Baseball Nerd' }];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class StatsRoutingModule {}
