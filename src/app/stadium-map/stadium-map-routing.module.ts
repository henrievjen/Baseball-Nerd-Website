import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StadiumMapComponent } from './stadium-map/stadium-map.component';

const routes: Routes = [{ path: '', component: StadiumMapComponent, title: 'Live MLB Stadium Weather | Baseball Nerd' }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class StadiumMapRoutingModule {}
