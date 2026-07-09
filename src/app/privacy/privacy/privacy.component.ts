import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../shared/seo.service';

@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss',
  standalone: false
})
export class PrivacyComponent implements OnInit {
  readonly updated = 'June 1, 2025';
  readonly contact = 'baseballnerdmlb@gmail.com';

  constructor(private seo: SeoService) {}

  ngOnInit() {
    this.seo.update(
      'Privacy Policy | Baseball Nerd',
      "Baseball Nerd's privacy policy, covering data collection, Google AdSense advertising, cookies, and how your information is used."
    );
  }
}
