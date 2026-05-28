import { Component, OnInit, AfterViewInit, Renderer2 } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

declare const adsbygoogle: any[];

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false
})
export class AppComponent implements OnInit, AfterViewInit {
  isLightMode = false;

  constructor(
    private renderer: Renderer2,
    private router: Router
  ) {
    // Failsafe to ensure scroll to top on every navigation
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      window.scrollTo(0, 0);
    });
  }

  ngOnInit() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      this.isLightMode = true;
      this.updateBodyClass();
    }
  }

  ngAfterViewInit() {
    try {
      (window as any)['adsbygoogle'] = (window as any)['adsbygoogle'] || [];
      (window as any)['adsbygoogle'].push({});
    } catch (e) { /* AdSense not loaded yet */ }
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
