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

  /** Cache so re-selecting the same team doesn't re-fetch. */
  private cache: Record<number, DcPosition[]> = {};

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
  ) {}

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

  get allTeams() { return this.teams.allTeams(); }

  get currentSeason(): number { return new Date().getFullYear(); }

  selectTeam(id: number, replaceUrl = false) {
    this.teamId = id;
    this.expanded = {};
    // Update URL so the team is bookmarkable / refresh-stable
    this.router.navigate(['/depth-chart', id], { replaceUrl });

    if (this.cache[id]) {
      this.positions = this.cache[id];
      this.error = '';
      this.loading = false;
      return;
    }
    this.fetchDepthChart(id);
  }

  /** Season actually displayed (may differ from current year if data not yet available). */
  displayedSeason: number = new Date().getFullYear();

  /** Max players to show per position before requiring user to expand. */
  readonly MAX_VISIBLE = 6;

  /** Per-position expansion state, keyed by position abbreviation. */
  expanded: Record<string, boolean> = {};

  toggleExpanded(abbr: string) {
    this.expanded[abbr] = !this.expanded[abbr];
  }

  private fetchDepthChart(teamId: number) {
    this.loading = true;
    this.error = '';
    this.positions = [];

    const currentSeason = new Date().getFullYear();
    this.tryFetchSeason(teamId, currentSeason, /*allowFallback*/ true);
  }

  /**
   * Fetches the team roster with hydrated fielding splits for a season.
   * If the response has no usable data and `allowFallback` is true, retries
   * with the previous season (handles preseason/offseason).
   */
  private tryFetchSeason(teamId: number, season: number, allowFallback: boolean) {
    this.api.getTeamRosterWithFielding(teamId, season)
      .pipe(catchError(() => of(null)))
      .subscribe((resp: any) => {
        const positions = this.parseRosterResponse(resp);

        if (positions.length === 0 && allowFallback) {
          // No data for this season yet — try the previous one.
          this.tryFetchSeason(teamId, season - 1, false);
          return;
        }

        this.loading = false;
        if (!resp && positions.length === 0) {
          this.error = 'Unable to load depth chart.';
          return;
        }

        this.displayedSeason = season;
        this.cache[teamId] = positions;
        this.positions = positions;
      });
  }

  /**
   * Parse a /teams/{id}/roster response hydrated with fielding splits.
   * Each roster entry contains a person with stats[].splits[] — one split per
   * position the player appeared at, with stat.gamesStarted / stat.games.
   * Players with no fielding splits are still slotted under their primary
   * position with 0/0 so the depth chart isn't blank in the preseason.
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

      // Preseason / no stats yet → slot under primary roster position so the
      // chart isn't empty. We still skip pitchers here because every pitcher
      // would collapse under "P" and make the list huge with 0/0 rows; instead
      // pitchers without splits are added below only when no one has stats.
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

    // If literally nobody has fielding stats yet (true preseason), also add
    // pitchers under "P" so the chart still has all positions populated.
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

