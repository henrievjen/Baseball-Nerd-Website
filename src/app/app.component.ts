import { Component, OnInit, OnDestroy, Renderer2, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { SeoService } from './shared/seo.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false
})
export class AppComponent implements OnInit, OnDestroy {
  isLightMode = false;
  private routerSub!: Subscription;
  private readonly isBrowser: boolean;

  constructor(
    private renderer: Renderer2,
    private router: Router,
    private seo: SeoService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    if (this.isBrowser) {
      const saved = localStorage.getItem('theme');
      if (saved === 'light') {
        this.isLightMode = true;
        this.updateBodyClass();
      }
    }

    this.routerSub = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event) => {
      // Runs on both server (prerendering each configured route) and
      // browser: every route needs its own canonical tag, not just the
      // one baked into index.html for "/".
      this.seo.updateCanonical(event.urlAfterRedirects);

      // Push a new ad unit on every route change so AdSense refreshes in
      // this Single Page Application. Also scroll to top on navigation.
      // Browser-only: during prerendering there is no window to scroll
      // and no ad slot to refresh.
      if (!this.isBrowser) return;
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
