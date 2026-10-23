import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { EMPTY_NPB_SEASON, NPB_FIRST_SEASON, NpbSeason, npbSeasonUrl, parseNpbSeason } from './npb-data';

/** How long a season file is reused. The source only changes a few times a day, so switching seasons back and forth must not re-download ~700 KB each time. */
const CURRENT_TTL_MS = 5 * 60_000;
const PAST_TTL_MS = 60 * 60_000;

/**
 * Loads NPB season files (see npb-data.ts for where they come from and what they lack).
 * One request per season, cached in memory.
 */
@Injectable({ providedIn: 'root' })
export class NpbDataService {
  private cache = new Map<number, { at: number; season$: Observable<NpbSeason> }>();

  constructor(private http: HttpClient) {}

  /**
   * A whole season. A season the data set doesn't have (before 2021, or a new year
   * whose file hasn't been created yet) is an empty season rather than an error;
   * any other failure is an error, and is not cached.
   */
  getSeason(season: number): Observable<NpbSeason> {
    if (!Number.isInteger(season) || season < NPB_FIRST_SEASON) return of(EMPTY_NPB_SEASON);

    const hit = this.cache.get(season);
    const ttl = season >= new Date().getFullYear() ? CURRENT_TTL_MS : PAST_TTL_MS;
    if (hit && Date.now() - hit.at < ttl) return hit.season$;

    const season$: Observable<NpbSeason> = this.http.get<unknown>(npbSeasonUrl(season)).pipe(
      map(parseNpbSeason),
      catchError(err => err?.status === 404 ? of(EMPTY_NPB_SEASON) : throwError(() => err)),
      tap({ error: () => { if (this.cache.get(season)?.season$ === season$) this.cache.delete(season); } }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.cache.set(season, { at: Date.now(), season$ });
    return season$;
  }
}
