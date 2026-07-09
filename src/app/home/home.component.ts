import { Component, OnInit } from '@angular/core';
import { SeoService } from '../shared/seo.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  standalone: false
})
export class HomeComponent implements OnInit {
  constructor(private seo: SeoService) {}

  ngOnInit() {
    this.seo.update(
      'Baseball Nerd — Live MLB Scores, Standings & Stats',
      'Baseball Nerd is a free, fast MLB companion with live scores, standings, player stats, team schedules, depth charts, and stadium weather for all 30 teams.'
    );
  }
}
