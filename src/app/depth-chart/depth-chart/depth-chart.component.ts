import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { MlbApiService } from '../../shared/mlb-api.service';
import { TeamDataService } from '../../shared/team-data.service';
import { PlayerService } from '../../shared/player.service';
import { FavoriteTeamsService } from '../../shared/favorite-teams.service';

interface DcPlayer {
  playerId: number;
  name: string;
  gamesStarted: number;
  games: number;
}

interface DcPosition {
  abbr: string;
  name: string;
  players: DcPlayer[];
  totalStarts: number;
}

@Component({
  selector: 'app-depth-chart',
  templateUrl: './depth-chart.component.html',
  styleUrl: './depth-chart.component.scss',
  standalone: false
})
export class DepthChartComponent implements OnInit {
  /** Currently selected team for the depth chart view. */
  teamId: number | null = null;
  loading = false;
  error = '';
  positions: DcPosition[] = [];

  /** Currently selected season. */
  season: number = new Date().getFullYear();

  /** Available years for the picker. */
  years: number[] = [];

  /** Mobile: whether the team selection bar is expanded or collapsed. */
  isTeamBarExpanded = false;

  /** Cache so re-selecting the same team/season doesn't re-fetch. Key format: "teamId|season" */
  private cache: Record<string, DcPosition[]> = {};

  private readonly POS_ORDER = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  private readonly POS_NAMES: Record<string, string> = {
    'P': 'Pitcher', 'C': 'Catcher',
    '1B': 'First Base', '2B': 'Second Base', '3B': 'Third Base', 'SS': 'Shortstop',
    'LF': 'Left Field', 'CF': 'Center Field', 'RF': 'Right Field', 'DH': 'Designated Hitter'
  };

  constructor(
    public teams: TeamDataService,
    private api: MlbApiService,
    private playerSvc: PlayerService,
    public favorites: FavoriteTeamsService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.generateYears();
  }

  ngOnInit() {
    this.route.paramMap.subscribe(pm => {
      const id = Number(pm.get('teamId'));
      if (id && !Number.isNaN(id)) {
        this.selectTeam(id, false);
      } else {
        // Default to first favorite, else first team alphabetically
        const firstFav = [...this.favorites.favorites][0];
        const def = firstFav ?? this.teams.allTeams()[0]?.id;
        if (def) this.selectTeam(def, true);
      }
    });
  }

  private generateYears() {
    const end = new Date().getFullYear();
    const start = 2000;
    for (let y = end; y >= start; y--) {
      this.years.push(y);
    }
  }

  get allTeams() { return this.teams.allTeams(); }

  get currentSeason(): number { return new Date().getFullYear(); }

  selectTeam(id: number, replaceUrl = false) {
    this.teamId = id;
    this.expanded = {};
    // On mobile, collapse the bar after selection
    this.isTeamBarExpanded = false;

    // Update URL so the team is bookmarkable / refresh-stable
    this.router.navigate(['/depth-chart', id], { replaceUrl });

    this.loadData();
  }

  selectSeason(year: number) {
    this.season = year;
    this.loadData();
  }

  private loadData() {
    if (!this.teamId) return;

    const cacheKey = `${this.teamId}|${this.season}`;
    if (this.cache[cacheKey]) {
      this.positions = this.cache[cacheKey];
      this.error = '';
      this.loading = false;
      return;
    }
    this.fetchDepthChart(this.teamId, this.season);
  }

  /** Max players to show per position before requiring user to expand. */
  readonly MAX_VISIBLE = 6;

  /** Per-position expansion state, keyed by position abbreviation. */
  expanded: Record<string, boolean> = {};

  toggleExpanded(abbr: string) {
    this.expanded[abbr] = !this.expanded[abbr];
  }

  toggleTeamBar() {
    this.isTeamBarExpanded = !this.isTeamBarExpanded;
  }

  private fetchDepthChart(teamId: number, season: number) {
    this.loading = true;
    this.error = '';
    this.positions = [];

    // Fallback is only allowed for the current year (initial load)
    const allowFallback = season === new Date().getFullYear();
    this.tryFetchSeason(teamId, season, allowFallback);
  }

  /**
   * Fetches the team roster with hydrated fielding splits for a season.
   */
  private tryFetchSeason(teamId: number, season: number, allowFallback: boolean) {
    this.api.getTeamRosterWithFielding(teamId, season)
      .pipe(catchError(() => of(null)))
      .subscribe((resp: any) => {
        const positions = this.parseRosterResponse(resp);

        if (positions.length === 0 && allowFallback) {
          // No data for this season yet — try the previous one.
          this.season = season - 1;
          this.tryFetchSeason(teamId, this.season, false);
          return;
        }

        this.loading = false;
        if (!resp && positions.length === 0) {
          this.error = `Unable to load depth chart for ${season}.`;
          return;
        }

        const cacheKey = `${teamId}|${season}`;
        this.cache[cacheKey] = positions;
        this.positions = positions;
      });
  }

  /**
   * Parse a /teams/{id}/roster response hydrated with fielding splits.
   */
  private parseRosterResponse(resp: any): DcPosition[] {
    if (!resp) return [];
    const roster: any[] = resp?.roster ?? [];
    if (!roster.length) return [];

    const byPos = new Map<string, DcPlayer[]>();
    // De-dupe (player, position) entries to be safe
    const seenKey = new Set<string>();

    let anyWithStats = false;

    for (const entry of roster) {
      const person = entry.person || {};
      const playerId = person.id ?? entry.parentTeamId;
      const name = person.fullName || entry.jerseyNumber || '—';

      // Pull all fielding splits (one per position)
      const fieldingGroup = (person.stats || []).find((s: any) =>
        (s.group?.displayName || s.group?.code || '').toLowerCase() === 'fielding'
      );
      const splits: any[] = fieldingGroup?.splits ?? [];

      let added = false;
      for (const sp of splits) {
        const stat = sp.stat || {};
        const abbr = stat.position?.abbreviation
          ?? sp.position?.abbreviation
          ?? entry.position?.abbreviation;
        if (!abbr) continue;
        const gs = Number(stat.gamesStarted ?? 0);
        const gp = Number(stat.games ?? 0);
        if (!gs && !gp) continue;

        const key = `${playerId}|${abbr}`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);

        if (!byPos.has(abbr)) byPos.set(abbr, []);
        byPos.get(abbr)!.push({
          playerId,
          name,
          gamesStarted: gs,
          games: gp
        });
        added = true;
        anyWithStats = true;
      }

      if (!added) {
        const abbr = entry.position?.abbreviation;
        if (abbr && abbr !== 'P') {
          const key = `${playerId}|${abbr}`;
          if (!seenKey.has(key)) {
            seenKey.add(key);
            if (!byPos.has(abbr)) byPos.set(abbr, []);
            byPos.get(abbr)!.push({ playerId, name, gamesStarted: 0, games: 0 });
          }
        }
      }
    }

    if (!anyWithStats) {
      for (const entry of roster) {
        const abbr = entry.position?.abbreviation;
        if (abbr !== 'P') continue;
        const person = entry.person || {};
        const playerId = person.id;
        const name = person.fullName || '—';
        const key = `${playerId}|P`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);
        if (!byPos.has('P')) byPos.set('P', []);
        byPos.get('P')!.push({ playerId, name, gamesStarted: 0, games: 0 });
      }
    }

    return this.buildPositions(byPos);
  }

  private buildPositions(byPos: Map<string, DcPlayer[]>): DcPosition[] {
    const positions: DcPosition[] = [];
    const seen = new Set<string>();

    for (const abbr of this.POS_ORDER) {
      if (!byPos.has(abbr)) continue;
      const players = byPos.get(abbr)!.sort((a, b) =>
        b.gamesStarted - a.gamesStarted || b.games - a.games || a.name.localeCompare(b.name)
      );
      positions.push({
        abbr,
        name: this.POS_NAMES[abbr] || abbr,
        players,
        totalStarts: players.reduce((s, p) => s + p.gamesStarted, 0)
      });
      seen.add(abbr);
    }

    for (const [abbr, players] of byPos.entries()) {
      if (seen.has(abbr)) continue;
      players.sort((a, b) =>
        b.gamesStarted - a.gamesStarted || b.games - a.games || a.name.localeCompare(b.name)
      );
      positions.push({
        abbr,
        name: this.POS_NAMES[abbr] || abbr,
        players,
        totalStarts: players.reduce((s, p) => s + p.gamesStarted, 0)
      });
    }

    return positions;
  }

  openPlayer(p: DcPlayer) {
    if (p?.playerId) this.playerSvc.openPlayer(p.playerId);
  }

  toggleFavorite(ev: Event, id: number) {
    ev.stopPropagation();
    this.favorites.toggle(id);
  }

  trackByPos(_i: number, p: DcPosition) { return p.abbr; }
  trackByPlayer(_i: number, p: DcPlayer) { return p.playerId; }
  trackByTeam(_i: number, t: { id: number }) { return t.id; }
  trackByYear(_i: number, y: number) { return y; }

  photoError(ev: Event) {
    (ev.target as HTMLImageElement).style.visibility = 'hidden';
  }

  /** Sort the team list so favorites appear first. */
  get sortedTeams() {
    const favs = this.favorites.favorites;
    return [...this.allTeams].sort((a, b) => {
      const af = favs.has(a.id) ? 0 : 1;
      const bf = favs.has(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
  }
}
