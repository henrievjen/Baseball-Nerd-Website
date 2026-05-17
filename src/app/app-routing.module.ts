import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'scores', pathMatch: 'full' },
  {
    path: 'scores',
    loadChildren: () => import('./scores/scores.module').then(m => m.ScoresModule)
  },
  {
    path: 'standings',
    loadChildren: () => import('./standings/standings.module').then(m => m.StandingsModule)
  },
  {
    path: 'stats',
    loadChildren: () => import('./stats/stats.module').then(m => m.StatsModule)
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
