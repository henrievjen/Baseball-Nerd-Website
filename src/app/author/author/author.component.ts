import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../shared/seo.service';

@Component({
  selector: 'app-author',
  templateUrl: './author.component.html',
  styleUrl: './author.component.scss',
  standalone: false
})
export class AuthorComponent implements OnInit {
  constructor(private seo: SeoService) {}

  ngOnInit() {
    this.seo.update(
      'Henri Evjen — Creator of Baseball Nerd',
      'Henri Evjen is the creator and sole developer of Baseball Nerd, a lifelong baseball fan and card collector who builds and maintains every feature on the site.'
    );
  }
}
