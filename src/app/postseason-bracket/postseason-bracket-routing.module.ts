import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PostseasonBracketComponent } from './postseason-bracket/postseason-bracket.component';

const routes: Routes = [
  { path: '', component: PostseasonBracketComponent, title: 'MLB Postseason Bracket | Baseball Nerd' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PostseasonBracketRoutingModule {}
