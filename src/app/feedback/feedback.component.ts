import { Component } from '@angular/core';

@Component({
  selector: 'app-feedback',
  templateUrl: './feedback.component.html',
  styleUrl: './feedback.component.scss',
  standalone: false
})
export class FeedbackComponent {
  subject = '';
  message = '';
  email = '';
  readonly contactEmail = 'baseballnerd.business@gmail.com';

  sendFeedback() {
    const mailtoLink = `mailto:${this.contactEmail}?subject=${encodeURIComponent(this.subject || 'Feedback from Baseball Nerd')}&body=${encodeURIComponent(
      `Message: ${this.message}${this.email ? `\n\nFrom: ${this.email}` : ''}`
    )}`;
    window.location.href = mailtoLink;
  }
}
