import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthorComponent } from './author/author.component';

const routes: Routes = [
  { path: '', redirectTo: 'henri-evjen', pathMatch: 'full' },
  { path: 'henri-evjen', component: AuthorComponent, title: 'Henri Evjen — Baseball Nerd' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AuthorRoutingModule {}
