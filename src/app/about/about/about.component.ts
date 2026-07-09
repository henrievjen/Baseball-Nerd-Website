import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../shared/seo.service';

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
  standalone: false
})
export class AboutComponent implements OnInit {
  qrError = false;

  constructor(private seo: SeoService) {}

  ngOnInit() {
    this.seo.update(
      'About Baseball Nerd',
      'Learn about Baseball Nerd, a free MLB companion built by a lifelong baseball fan, and find links to the Android app and developer contact information.'
    );
  }
}
