import { Component, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false
})
export class AppComponent implements OnInit, OnDestroy {
  isLightMode = false;
  private routerSub!: Subscription;

  constructor(
    private renderer: Renderer2,
    private router: Router
  ) {}

  ngOnInit() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      this.isLightMode = true;
      this.updateBodyClass();
    }

    // Push a new ad unit on every route change so AdSense refreshes
    // in this Single Page Application. Also scroll to top on navigation.
    this.routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      window.scrollTo(0, 0);
      this.pushAd();
    });
  }

  private pushAd() {
    try {
      (window as any)['adsbygoogle'] = (window as any)['adsbygoogle'] || [];
      (window as any)['adsbygoogle'].push({});
    } catch (e) { /* AdSense not loaded */ }
  }

  ngOnDestroy() {
    if (this.routerSub) this.routerSub.unsubscribe();
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
