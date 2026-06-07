import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GamesRoutingModule } from './games-routing.module';
import { GamesComponent } from './games/games.component';

@NgModule({
  declarations: [GamesComponent],
  imports: [
    CommonModule,
    FormsModule,
    GamesRoutingModule
  ]
})
export class GamesModule { }
