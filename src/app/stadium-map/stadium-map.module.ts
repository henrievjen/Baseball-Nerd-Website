import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { StadiumMapRoutingModule } from './stadium-map-routing.module';
import { StadiumMapComponent } from './stadium-map/stadium-map.component';

@NgModule({
  declarations: [StadiumMapComponent],
  imports: [
    CommonModule,
    HttpClientModule,
    StadiumMapRoutingModule
  ]
})
export class StadiumMapModule {}
