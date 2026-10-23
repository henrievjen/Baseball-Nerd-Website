import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { MlbApiService } from '../../shared/mlb-api.service';
import { NpbDataService } from '../../shared/npb-data.service';
import { NpbRawGame } from '../../shared/npb-data';
import { LeagueProfile } from './league-profile';
import { LgStandingsView, buildLgStandings } from './league-standings-model';
import { PsView, buildLeaguePostseason } from './league-postseason-model';
import { buildNpbRecords, latestResultDate } from './npb-standings';

/** Which slice of a split season is shown. */
export type Period = 'full' | 'first' | 'second';

export interface LeagueBundle {
  season: number;
  leagueIds: number[];
  views: Partial<Record<Period, LgStandingsView>>;
  /** Periods the feed has data for — always starts with 'full'. */
  periods: Period[];
  /** Null when the postseason couldn't be loaded; an empty view when there simply isn't one. */
  postseason: PsView | null;
  /** Date (YYYY-MM-DD) of the newest result the tables include — set for sources that aren't live (NPB). */
  through?: string;
}

export interface RawLeagueData {
  full: any;
  first?: any;
  second?: any;
  postseason?: any[] | null;
}

/** Pulls the games out of a `v1/schedule` response. */
export function gamesOf(res: any): any[] {
  return (res?.dates ?? []).flatMap((d: any) => d?.games ?? []);
}

/**
 * Pure: raw responses → everything the page needs. A first/second half is only offered
 * when it holds some, but not all, of the season's games (a feed that answers a half
 * request with the full season, or with an empty table, would otherwise add a useless button).
 */
export function buildBundle(season: number, leagueIds: number[], raw: RawLeagueData): LeagueBundle {
  const full = buildLgStandings(raw.full?.records);
  const views: LeagueBundle['views'] = { full };
  const periods: Period[] = ['full'];

  for (const [period, res] of [['first', raw.first], ['second', raw.second]] as const) {
    if (!res) continue;
    const v = buildLgStandings(res.records);
    if (v.games > 0 && v.games < full.games) { views[period] = v; periods.push(period); }
  }

  return {
    season,
    leagueIds,
    views,
    periods,
    postseason: raw.postseason == null ? null : buildLeaguePostseason(raw.postseason)
  };
}

/** NPB: the season's finished games → tables (no divisions, halves or postseason in that data). */
export function buildNpbBundle(season: number, games: readonly NpbRawGame[]): LeagueBundle {
  const bundle = buildBundle(season, [], { full: { records: buildNpbRecords(games) }, postseason: [] });
  const through = latestResultDate(games);
  return through ? { ...bundle, through } : bundle;
}

/** Data for the non-MLB leagues on the Standings page. */
@Injectable({ providedIn: 'root' })
export class LeagueStandingsService {
  private idCache = new Map<string, number[]>();

  constructor(private api: MlbApiService, private npb: NpbDataService) {}

  /** League ids to query: fixed for fall/winter leagues, looked up per season for the minor-league levels. */
  leagueIds(p: LeagueProfile, season: number): Observable<number[]> {
    if (p.leagueIds?.length) return of(p.leagueIds);
    const key = `${p.sportId}:${season}`;
    const hit = this.idCache.get(key);
    if (hit) return of(hit);
    return this.api.getSportLeagues(p.sportId, season).pipe(
      map(res => (res?.leagues ?? []).map((l: any) => Number(l?.id)).filter((id: number) => id > 0)),
      tap(ids => { if (ids.length) this.idCache.set(key, ids); })
    );
  }

  load(p: LeagueProfile, season: number): Observable<LeagueBundle> {
    if (p.def.provider === 'npb-data') {
      return this.npb.getSeason(season).pipe(map(s => buildNpbBundle(season, s.games)));
    }
    return this.leagueIds(p, season).pipe(
      switchMap(ids => {
        if (!ids.length) return of(buildBundle(season, ids, { full: { records: [] }, postseason: [] }));
        const quiet = <T>(o: Observable<T>): Observable<T | null> => o.pipe(catchError(() => of(null)));
        return forkJoin({
          full: this.api.getLeagueStandings(ids, season),                                  // a failure here is a real error
          first: p.halves ? quiet(this.api.getLeagueStandings(ids, season, 'firstHalf')) : of(null),
          second: p.halves ? quiet(this.api.getLeagueStandings(ids, season, 'secondHalf')) : of(null),
          post: quiet(this.api.getLeaguePostseasonGames(p.sportId, ids, season))
        }).pipe(map(r => buildBundle(season, ids, {
          full: r.full, first: r.first, second: r.second,
          postseason: r.post ? gamesOf(r.post) : null
        })));
      })
    );
  }

  /** Re-fetches just the postseason (used to keep an unfinished one fresh). */
  postseason(p: LeagueProfile, season: number, ids: number[]): Observable<PsView | null> {
    return this.api.getLeaguePostseasonGames(p.sportId, ids, season).pipe(
      map(res => buildLeaguePostseason(gamesOf(res))),
      catchError(() => of(null))
    );
  }
}
