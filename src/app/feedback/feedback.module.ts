import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FeedbackRoutingModule } from './feedback-routing.module';
import { FeedbackComponent } from './feedback.component';

@NgModule({
  declarations: [FeedbackComponent],
  imports: [
    CommonModule,
    FormsModule,
    FeedbackRoutingModule
  ]
})
export class FeedbackModule { }
