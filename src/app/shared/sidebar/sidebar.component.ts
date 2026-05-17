import { Component } from '@angular/core';
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
export class SidebarComponent {
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

  isActive(route: string) { return this.currentRoute.startsWith(route); }
  navigate(route: string) { this.router.navigate([route]); }
  toggleCollapsed()       { this.collapsed = !this.collapsed; }
}
