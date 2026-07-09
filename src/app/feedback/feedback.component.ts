import { Component, OnInit } from '@angular/core';
import { SeoService } from '../shared/seo.service';

@Component({
  selector: 'app-feedback',
  templateUrl: './feedback.component.html',
  styleUrl: './feedback.component.scss',
  standalone: false
})
export class FeedbackComponent implements OnInit {
  subject = '';
  message = '';
  email = '';
  readonly contactEmail = 'baseballnerd.business@gmail.com';

  constructor(private seo: SeoService) {}

  ngOnInit() {
    this.seo.update(
      'Feedback & Feature Requests | Baseball Nerd',
      'Report a bug or request a feature for Baseball Nerd. Send feedback directly to the developer — all messages are read and considered for future updates.'
    );
  }

  sendFeedback() {
    const mailtoLink = `mailto:${this.contactEmail}?subject=${encodeURIComponent(this.subject || 'Feedback from Baseball Nerd')}&body=${encodeURIComponent(
      `Message: ${this.message}${this.email ? `\n\nFrom: ${this.email}` : ''}`
    )}`;
    window.location.href = mailtoLink;
  }
}
