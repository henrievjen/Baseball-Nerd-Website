import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DepthChartComponent } from './depth-chart/depth-chart.component';

const routes: Routes = [
  { path: '', component: DepthChartComponent },
  { path: ':teamId', component: DepthChartComponent }
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class DepthChartRoutingModule {}

