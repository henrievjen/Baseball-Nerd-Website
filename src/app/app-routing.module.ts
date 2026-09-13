import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./scores/scores.module').then(m => m.ScoresModule)
  },
  {
    // Scores now lives at the root ("/") — redirect the old URL there
    // instead of rendering the same content at two different addresses,
    // which would recreate exactly the duplicate-content problem the
    // canonical-URL cleanup was meant to fix.
    path: 'scores',
    redirectTo: '',
    pathMatch: 'full'
  },
  {
    path: 'standings',
    loadChildren: () => import('./standings/standings.module').then(m => m.StandingsModule)
  },
  {
    path: 'stats',
    loadChildren: () => import('./stats/stats.module').then(m => m.StatsModule)
  },
  {
    path: 'players',
    loadChildren: () => import('./players/players.module').then(m => m.PlayersModule)
  },
  {
    path: 'team-schedule',
    loadChildren: () => import('./team-schedule/team-schedule.module').then(m => m.TeamScheduleModule)
  },
  {
    path: 'depth-chart',
    loadChildren: () => import('./depth-chart/depth-chart.module').then(m => m.DepthChartModule)
  },
  {
    path: 'feedback',
    loadChildren: () => import('./feedback/feedback.module').then(m => m.FeedbackModule)
  },
  {
    path: 'about',
    loadChildren: () => import('./about/about.module').then(m => m.AboutModule)
  },
  {
    path: 'privacy',
    loadChildren: () => import('./privacy/privacy.module').then(m => m.PrivacyModule)
  },
  {
    path: 'stadium-weather',
    loadChildren: () => import('./stadium-map/stadium-map.module').then(m => m.StadiumMapModule)
  },
  {
    path: 'author',
    loadChildren: () => import('./author/author.module').then(m => m.AuthorModule)
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    scrollPositionRestoration: 'enabled'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule {}
