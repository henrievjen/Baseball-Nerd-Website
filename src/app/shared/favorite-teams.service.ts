import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

const STORAGE_KEY = 'bn.favoriteTeams';

/**
 * Stores the user's favorite MLB team IDs in localStorage and exposes a
 * reactive set of favorites. Used to pin favorite teams' games to the
 * top of the Scores page.
 */
@Injectable({ providedIn: 'root' })
export class FavoriteTeamsService {
  private readonly _favorites$ = new BehaviorSubject<Set<number>>(this.load());

  /** Observable set of favorite team IDs (re-emits on every change). */
  get favorites$(): Observable<Set<number>> { return this._favorites$.asObservable(); }

  /** Synchronous snapshot of favorite team IDs. */
  get favorites(): Set<number> { return this._favorites$.value; }

  isFavorite(teamId: number | undefined | null): boolean {
    if (teamId == null) return false;
    return this._favorites$.value.has(teamId);
  }

  toggle(teamId: number | undefined | null): boolean {
    if (teamId == null) return false;
    const next = new Set(this._favorites$.value);
    let isFav: boolean;
    if (next.has(teamId)) { next.delete(teamId); isFav = false; }
    else                  { next.add(teamId);    isFav = true;  }
    this.persist(next);
    this._favorites$.next(next);
    return isFav;
  }

  add(teamId: number) {
    if (this._favorites$.value.has(teamId)) return;
    const next = new Set(this._favorites$.value);
    next.add(teamId);
    this.persist(next);
    this._favorites$.next(next);
  }

  remove(teamId: number) {
    if (!this._favorites$.value.has(teamId)) return;
    const next = new Set(this._favorites$.value);
    next.delete(teamId);
    this.persist(next);
    this._favorites$.next(next);
  }

  clear() {
    this.persist(new Set());
    this._favorites$.next(new Set());
  }

  /** True when either team in the game is favorited. */
  gameInvolvesFavorite(game: any): boolean {
    const a = game?.teams?.away?.team?.id;
    const h = game?.teams?.home?.team?.id;
    return this.isFavorite(a) || this.isFavorite(h);
  }

  private load(): Set<number> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.filter((x: any) => typeof x === 'number'));
    } catch {
      return new Set();
    }
  }

  private persist(set: Set<number>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    } catch { /* ignore quota / SSR */ }
  }
}

