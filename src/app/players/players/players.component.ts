import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { MlbApiService } from '../../shared/mlb-api.service';
import { TeamDataService } from '../../shared/team-data.service';
import { PlayerService } from '../../shared/player.service';

interface PlayerRow {
  id: number;
  fullName: string;
  firstLastName: string;
  posAbbr: string;
  teamId: number;
  teamName: string;
  isActive: boolean;
}

@Component({
  selector: 'app-players',
  templateUrl: './players.component.html',
  styleUrl: './players.component.scss',
  standalone: false
})
export class PlayersComponent implements OnInit, OnDestroy {
  query = '';
  loading = false;
  hasSearched = false;
  results: PlayerRow[] = [];

  /** Full roster cache for the current season — populated lazily on first search */
  private roster: PlayerRow[] | null = null;
  private rosterLoading = false;
  private rosterSeason = new Date().getFullYear();

  private input$ = new Subject<string>();
  private sub?: Subscription;

  constructor(
    private api: MlbApiService,
    public teams: TeamDataService,
    private playerSvc: PlayerService
  ) {}

  ngOnInit() {
    this.sub = this.input$.pipe(
      debounceTime(180),
      distinctUntilChanged(),
      switchMap(q => {
        const term = q.trim();
        this.hasSearched = term.length > 0;
        if (!term) {
          this.results = [];
          this.loading = false;
          return of(null);
        }
        this.loading = true;
        // Kick off roster fetch (current season, used for hydration) but
        // ALWAYS call the API search too — it's the only way to surface
        // historical / retired players who aren't on any current roster.
        this.ensureRoster();
        return this.api.searchPlayers(term, 30).pipe(
          catchError(() => of({ people: [] }))
        );
      })
    ).subscribe((res: any) => {
      if (res) {
        const apiRows: PlayerRow[] = (res.people ?? []).map((p: any) => this.toRow(p));
        const rosterRows = this.roster ? this.filterRoster(this.query.trim()) : [];
        this.results = this.mergeAndRank(apiRows, rosterRows, this.query.trim());
        this.loading = false;
      }
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  onInput(value: string) {
    this.query = value;
    this.input$.next(value);
  }

  clear() {
    this.query = '';
    this.results = [];
    this.hasSearched = false;
    this.input$.next('');
  }

  openPlayer(id: number) { if (id) this.playerSvc.openPlayer(id); }

  trackById(_: number, p: PlayerRow) { return p.id; }
  logoError(ev: Event)  { (ev.target as HTMLImageElement).style.display = 'none'; }
  photoError(ev: Event) { (ev.target as HTMLImageElement).style.opacity = '0'; }

  // ── internals ───────────────────────────────────────────────
  private ensureRoster() {
    if (this.roster || this.rosterLoading) return;
    this.rosterLoading = true;
    this.api.getAllPlayers(this.rosterSeason).pipe(
      catchError(() => of({ people: [] }))
    ).subscribe((data: any) => {
      this.roster = (data.people ?? []).map((p: any) => this.toRow(p));
      this.rosterLoading = false;
      // Hydrate any visible results with team info from the freshly loaded roster.
      if (this.results.length) {
        this.results = this.hydrateResults(this.results);
      }
    });
  }

  /** Fill in missing team info on rows by looking them up in the roster cache. */
  private hydrateResults(rows: PlayerRow[]): PlayerRow[] {
    if (!this.roster) return rows;
    const byId = new Map<number, PlayerRow>();
    for (const r of this.roster) byId.set(r.id, r);
    return rows.map(r => {
      if (r.teamId && r.teamName) return r;
      const match = byId.get(r.id);
      if (!match) return r;
      return {
        ...r,
        teamId: r.teamId || match.teamId,
        teamName: r.teamName || match.teamName,
        posAbbr: r.posAbbr || match.posAbbr
      };
    });
  }

  private filterRoster(term: string): PlayerRow[] {
    if (!this.roster || !term) return [];
    const t = term.toLowerCase();
    const matches: PlayerRow[] = [];
    for (const p of this.roster) {
      if (p.fullName.toLowerCase().includes(t) || p.firstLastName.toLowerCase().includes(t)) {
        matches.push({ ...p, isActive: true });
        if (matches.length >= 100) break;
      }
    }
    return matches;
  }

  private toRow(p: any): PlayerRow {
    const teamId = p.currentTeam?.id ?? 0;
    // Players returned with currentTeam.sport.id === 1 are active MLB. Historical
    // players from the inactive search either omit currentTeam or have an
    // active=false flag on the person record.
    const isActive = teamId > 0 && (p.active !== false);
    return {
      id: p.id,
      fullName: p.fullName ?? '',
      firstLastName: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
      posAbbr: p.primaryPosition?.abbreviation ?? '',
      teamId,
      teamName: p.currentTeam?.name ?? this.teams.name(teamId) ?? '',
      isActive
    };
  }

  /**
   * Merge API search results with active-roster matches, removing duplicates
   * (preferring roster rows because they include reliable team info) and
   * ranking active starts-with matches first, then active includes, then
   * historical players.
   */
  private mergeAndRank(apiRows: PlayerRow[], rosterRows: PlayerRow[], term: string): PlayerRow[] {
    const byId = new Map<number, PlayerRow>();

    // Roster rows first → they always have team info; mark active.
    for (const r of rosterRows) {
      byId.set(r.id, { ...r, isActive: true });
    }
    // Then API rows — only add if missing, else hydrate any missing fields.
    for (const r of apiRows) {
      const existing = byId.get(r.id);
      if (existing) {
        byId.set(r.id, {
          ...existing,
          posAbbr: existing.posAbbr || r.posAbbr,
          teamId: existing.teamId || r.teamId,
          teamName: existing.teamName || r.teamName,
          isActive: existing.isActive || r.isActive
        });
      } else {
        byId.set(r.id, r);
      }
    }

    const t = term.toLowerCase();
    const all = [...byId.values()];

    const rank = (p: PlayerRow): number => {
      const name = p.fullName.toLowerCase();
      // Active players outrank historical; starts-with outranks contains.
      const activeBoost = p.isActive ? 0 : 100;
      if (name.startsWith(t))           return 0 + activeBoost;
      if (name.includes(' ' + t))       return 10 + activeBoost; // last-name start
      return 20 + activeBoost;
    };

    all.sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return a.fullName.localeCompare(b.fullName);
    });

    return all.slice(0, 50);
  }
}

