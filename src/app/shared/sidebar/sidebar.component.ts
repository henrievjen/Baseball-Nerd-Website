import { Component, AfterViewInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  standalone: false
})
export class SidebarComponent implements AfterViewInit {
  collapsed = false;
  currentRoute = '';

  navItems: NavItem[] = [
    { label: 'Scores',    route: '/scores',    icon: 'scores' },
    { label: 'Standings', route: '/standings', icon: 'standings' },
    { label: 'Stats',     route: '/stats',     icon: 'stats' },
  ];

  constructor(private router: Router) {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => this.currentRoute = e.urlAfterRedirects);
  }

  ngAfterViewInit() {
    // Initialise the AdSense unit after the DOM is ready.
    // The global adsbygoogle array is pushed to by the AdSense script.
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (e) {
      // AdSense script not yet loaded or blocked — fail silently.
    }
  }

  isActive(route: string) { return this.currentRoute.startsWith(route); }
  navigate(route: string) { this.router.navigate([route]); }
  toggleCollapsed()       { this.collapsed = !this.collapsed; }
}