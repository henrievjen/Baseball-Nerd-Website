import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StandingsComponent } from './standings/standings.component';

const routes: Routes = [{ path: '', component: StandingsComponent, title: 'MLB Standings — AL & NL Division and Wild Card Standings | Baseball Nerd' }];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class StandingsRoutingModule {}
