import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ScoresComponent } from './scores/scores.component';

const routes: Routes = [{ path: '', component: ScoresComponent, title: 'Today\'s MLB Scores & Live Box Scores | Baseball Nerd' }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ScoresRoutingModule {}
