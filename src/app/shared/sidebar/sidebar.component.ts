import { Component, AfterViewInit, HostListener } from '@angular/core';
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
  isMoreOpen = false;

  navItems: NavItem[] = [
    { label: 'Scores',           route: '/scores',           icon: 'scores'   },
    { label: 'Standings',        route: '/standings',        icon: 'standings'},
    { label: 'Stats',            route: '/stats',            icon: 'stats'    },
    { label: 'Players',          route: '/players',          icon: 'players'  },
    { label: 'Team Schedule',    route: '/team-schedule',    icon: 'schedule' },
    { label: 'Depth Chart',      route: '/depth-chart',      icon: 'depth'    },
    { label: 'Stadium Weather',  route: '/stadium-weather',  icon: 'stadium'  },
    { label: 'Feedback',         route: '/feedback',         icon: 'feedback' },
    { label: 'About',            route: '/about',            icon: 'about'    },
  ];

  constructor(private router: Router) {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        this.currentRoute = e.urlAfterRedirects;
        this.isMoreOpen = false; // Close menu on navigation
      });
  }

  ngAfterViewInit() {
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (e) {}
  }

  isActive(route: string) { return this.currentRoute.startsWith(route); }

  isSecondaryActive() {
    return this.navItems.slice(3).some(item => this.isActive(item.route));
  }

  navigate(route: string) {
    this.router.navigate([route]);
    this.isMoreOpen = false;
  }

  toggleCollapsed() { this.collapsed = !this.collapsed; }

  private _suppressClose = false;

  toggleMore(event: Event) {
    event.stopPropagation();
    this.isMoreOpen = !this.isMoreOpen;
    // Suppress the document:click handler that fires in the same event cycle
    this._suppressClose = true;
    setTimeout(() => { this._suppressClose = false; }, 0);
  }

  @HostListener('document:click')
  closeMore() {
    if (this._suppressClose) return;
    this.isMoreOpen = false;
  }
}
