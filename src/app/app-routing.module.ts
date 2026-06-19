import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./home/home.module').then(m => m.HomeModule)
  },
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
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    scrollPositionRestoration: 'enabled'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule {}
