import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DepthChartRoutingModule } from './depth-chart-routing.module';
import { DepthChartComponent } from './depth-chart/depth-chart.component';

@NgModule({
  declarations: [DepthChartComponent],
  imports: [CommonModule, DepthChartRoutingModule]
})
export class DepthChartModule {}

