import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MlbApiService } from './mlb-api.service';
import { LeagueDef, leagueById } from './leagues';

/** Games for the requested leagues, each tagged with `_leagueId`. */
export interface LeagueGamesResult {
  games: any[];
  /** League ids whose request failed (their games are simply absent from `games`). */
  failed: string[];
}

/** One HTTP request to the MLB Stats API, covering one or more registry leagues. */
export interface SchedulePlan {
  defs: LeagueDef[];
  sportId: string;
  leagueId?: string;
  /** MLB keeps its full hydration (pitcher stats, decisions, TV); everything else stays light. */
  mlb: boolean;
}

/** Lighter hydration for non-MLB leagues — no per-pitcher season-stat lookups. */
const LIGHT_HYDRATE = 'linescore,team,broadcasts,decisions,probablePitcher,reschedule';

/**
 * Collapses the selected leagues into the fewest requests:
 *   - MLB            → its own request (sportId 1, unchanged from before)
 *   - leagueId-scoped leagues (winter/fall) → one request per sport, leagueId=a,b,c
 *   - whole-sport leagues (MiLB levels, International) → one request, sportId=11,12,…
 * so even "All leagues" is at most three requests.
 */
export function planRequests(defs: readonly LeagueDef[]): SchedulePlan[] {
  const plans: SchedulePlan[] = [];

  const mlb = defs.filter(d => d.id === 'mlb');
  if (mlb.length) plans.push({ defs: mlb, sportId: '1', mlb: true });

  const rest = defs.filter(d => d.id !== 'mlb');

  const scoped = rest.filter(d => d.leagueIds?.length);
  const bySport = new Map<number, LeagueDef[]>();
  for (const d of scoped) bySport.set(d.sportId, [...(bySport.get(d.sportId) ?? []), d]);
  for (const [sportId, group] of bySport) {
    plans.push({
      defs: group,
      sportId: String(sportId),
      leagueId: group.flatMap(d => d.leagueIds!).join(','),
      mlb: false
    });
  }

  const wholeSport = rest.filter(d => !d.leagueIds?.length);
  if (wholeSport.length) {
    plans.push({
      defs: wholeSport,
      sportId: [...new Set(wholeSport.map(d => d.sportId))].join(','),
      mlb: false
    });
  }

  return plans;
}

/**
 * Works out which registry league a returned game belongs to. Needed because
 * several leagues can share a request (e.g. AFL + LVBP are both sportId 17).
 * With `hydrate=team`, each team carries its own `league.id` and `sport.id`.
 */
export function matchLeague(game: any, defs: readonly LeagueDef[]): LeagueDef {
  if (defs.length === 1) return defs[0];

  const teams = [game?.teams?.home?.team, game?.teams?.away?.team];
  for (const t of teams) {
    const byLeague = defs.find(d => d.leagueIds?.includes(t?.league?.id));
    if (byLeague) return byLeague;
  }
  for (const t of teams) {
    const bySport = defs.find(d => !d.leagueIds?.length && d.sportId === t?.sport?.id);
    if (bySport) return bySport;
  }
  return defs.find(d => d.catchAll) ?? defs[defs.length - 1];
}

@Injectable({ providedIn: 'root' })
export class LeagueScoresService {
  constructor(private api: MlbApiService) {}

  /** Schedule + scores for every requested league on one date (YYYY-MM-DD). */
  getGames(leagueIds: readonly string[], dateStr: string): Observable<LeagueGamesResult> {
    const defs = leagueIds.map(id => leagueById(id)).filter((d): d is LeagueDef => !!d);
    const plans = planRequests(defs);
    if (!plans.length) return of({ games: [], failed: [] });

    return forkJoin(plans.map(plan => this.run(plan, dateStr))).pipe(
      map(results => ({
        games: results.flatMap(r => r.games),
        failed: results.flatMap(r => r.failed)
      }))
    );
  }

  private run(plan: SchedulePlan, dateStr: string): Observable<LeagueGamesResult> {
    const opts: any = { date: dateStr };
    if (!plan.mlb) {
      opts.sportId = plan.sportId;
      opts.hydrate = LIGHT_HYDRATE;
      if (plan.leagueId) opts.leagueId = plan.leagueId;
    }

    return this.api.getSchedule(opts).pipe(
      map((data: any): LeagueGamesResult => {
        const games = (data?.dates ?? []).flatMap((d: any) => d.games ?? []);
        for (const g of games) g._leagueId = matchLeague(g, plan.defs).id;
        return { games, failed: [] };
      }),
      catchError(() => of<LeagueGamesResult>({ games: [], failed: plan.defs.map(d => d.id) }))
    );
  }
}
