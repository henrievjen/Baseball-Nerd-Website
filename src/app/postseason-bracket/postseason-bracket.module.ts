import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PostseasonBracketRoutingModule } from './postseason-bracket-routing.module';
import { PostseasonBracketComponent } from './postseason-bracket/postseason-bracket.component';

@NgModule({
  declarations: [PostseasonBracketComponent],
  imports: [
    CommonModule,
    PostseasonBracketRoutingModule
  ]
})
export class PostseasonBracketModule { }
