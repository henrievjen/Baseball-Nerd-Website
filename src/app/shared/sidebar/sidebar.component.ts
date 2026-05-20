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
    { label: 'Scores',         route: '/scores',         icon: 'scores' },
    { label: 'Standings',      route: '/standings',      icon: 'standings' },
    { label: 'Stats',          route: '/stats',          icon: 'stats' },
    { label: 'Players',        route: '/players',        icon: 'players' },
    { label: 'Team Schedule',  route: '/team-schedule',  icon: 'schedule' },
    { label: 'Depth Chart',    route: '/depth-chart',    icon: 'depth' },
  ];

  constructor(private router: Router) {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => this.currentRoute = e.urlAfterRedirects);
  }

  ngAfterViewInit() {
    // Push once — the <ins> element is always in the DOM (uses [hidden], not *ngIf)
    // so this single call is sufficient for the lifetime of the sidebar.
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (e) {
      // Fail silently if AdSense script is blocked or not yet loaded.
    }
  }

  isActive(route: string) { return this.currentRoute.startsWith(route); }
  navigate(route: string) { this.router.navigate([route]); }
  toggleCollapsed()       { this.collapsed = !this.collapsed; }
}