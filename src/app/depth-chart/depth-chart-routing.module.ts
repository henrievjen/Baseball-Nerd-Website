import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DepthChartComponent } from './depth-chart/depth-chart.component';

const routes: Routes = [
  { path: '', component: DepthChartComponent, title: 'MLB Depth Charts by Position | Baseball Nerd' },
  { path: ':teamId', component: DepthChartComponent, title: 'Team Depth Chart | Baseball Nerd' }
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class DepthChartRoutingModule {}

