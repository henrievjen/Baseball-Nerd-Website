import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MlbApiService } from './mlb-api.service';

/**
 * Caches probable-pitcher season W-L records.
 *
 * The MLB schedule API's `probablePitcher` hydration only returns id +
 * fullName + link (no stats). To show a "(W-L)" record next to the pitcher
 * name we fetch each pitcher's season stats lazily on demand and cache them.
 *
 * Consumers ask for `record(pitcher)` synchronously — if the data isn't
 * cached yet, a fetch is kicked off in the background and the empty string
 * is returned. Subsequent calls (and Angular's change detection cycles)
 * will pick up the populated value.
 */
@Injectable({ providedIn: 'root' })
export class PitcherRecordService {
  /** id → "W-L" string (e.g. "5-3"), or '' once fetched if no data */
  private cache: Record<number, string> = {};
  private fetching: Record<number, boolean> = {};

  constructor(private api: MlbApiService) {}

  /**
   * Returns the formatted record like " (5-3)" (with leading space) for
   * inline display, or '' if not yet known. Triggers a fetch when needed.
   */
  record(pitcher: any): string {
    if (!pitcher?.id) return '';
    const id = pitcher.id;

    // Cached
    if (this.cache[id] !== undefined) {
      return this.cache[id] ? ` (${this.cache[id]})` : '';
    }

    // Try inline stats first (some hydrations may include them)
    const inline = this.extractRecord(pitcher.stats ?? pitcher.person?.stats);
    if (inline) {
      this.cache[id] = inline;
      return ` (${inline})`;
    }

    // Otherwise kick off a fetch
    if (!this.fetching[id]) {
      this.fetching[id] = true;
      const season = new Date().getFullYear();
      this.api.getPlayerStatsBySeason(id, season)
        .pipe(catchError(() => of(null)))
        .subscribe(data => {
          const rec = this.extractRecord(data?.stats);
          // Cache even an empty result so we don't refetch repeatedly
          this.cache[id] = rec ?? '';
          this.fetching[id] = false;
        });
    }
    return '';
  }

  private extractRecord(statsArray: any): string | null {
    if (!Array.isArray(statsArray) || !statsArray.length) return null;
    const entry = statsArray.find((s: any) =>
      s.group?.displayName?.toLowerCase() === 'pitching' ||
      s.group?.code === 'pitching'
    ) ?? statsArray[0];
    const stat = entry?.splits?.[0]?.stat ?? entry?.stats;
    if (stat && stat.wins !== undefined && stat.losses !== undefined) {
      return `${stat.wins}-${stat.losses}`;
    }
    return null;
  }
}

