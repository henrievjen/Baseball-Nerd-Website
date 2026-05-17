import { Component, OnInit, Renderer2 } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false
})
export class AppComponent implements OnInit {
  isLightMode = false;

  constructor(private renderer: Renderer2) {}

  ngOnInit() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      this.isLightMode = true;
      this.updateBodyClass();
    }
  }

  toggleTheme() {
    this.isLightMode = !this.isLightMode;
    localStorage.setItem('theme', this.isLightMode ? 'light' : 'dark');
    this.updateBodyClass();
  }

  private updateBodyClass() {
    if (this.isLightMode) {
      this.renderer.addClass(document.body, 'light-mode');
    } else {
      this.renderer.removeClass(document.body, 'light-mode');
    }
  }
}
