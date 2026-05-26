import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

const BASE = 'https://statsapi.mlb.com/api/';

@Injectable({ providedIn: 'root' })
export class MlbApiService {
  constructor(private http: HttpClient) {}

  private get<T>(path: string, params: Record<string, any> = {}): Observable<T> {
    let p = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null) p = p.set(k, String(v)); });
    return this.http.get<T>(`${BASE}${path}`, { params: p });
  }

  getSchedule(opts: { date?: string; teamId?: number; startDate?: string; endDate?: string; gamePks?: string } = {}) {
    return this.get<any>('v1/schedule', {
      sportId: 1,
      hydrate: 'linescore,team,broadcasts,decisions(person(stats(group=[pitching],type=[season],gameType=R))),probablePitcher(stats(group=[pitching],type=[season],gameType=R)),reschedule',
      ...opts
    });
  }

  /** Full season schedule for one team (regular + postseason + spring + exhibition + all-star). */
  getTeamSchedule(teamId: number, season: number) {
    return this.get<any>('v1/schedule', {
      sportId: 1,
      teamId,
      season,
      gameType: 'R,F,D,L,W,P,S,E,A',
      hydrate: 'linescore,team,broadcasts,probablePitcher'
    });
  }

  getBoxscore(gamePk: number) {
    return this.get<any>(`v1/game/${gamePk}/boxscore`, {
      hydrate: 'person(stats(group=[pitching,hitting],type=[season],gameType=R))'
    });
  }

  getStandings(season: number) {
    return this.get<any>('v1/standings', {
      leagueId: '103,104', season,
      standingsTypes: 'regularSeason',
      hydrate: 'division,league,team'
    });
  }

  getWildCard(season: number) {
    return this.get<any>('v1/standings', {
      leagueId: '103,104', season,
      standingsTypes: 'wildCard',
      hydrate: 'division,league,team'
    });
  }

  getStatsLeaders(key: string, group: string, season: number, teamId?: number) {
    return this.get<any>('v1/stats/leaders', {
      leaderCategories: key, statGroup: group,
      season, limit: 50, statType: 'season',
      teamId: teamId ?? undefined
    });
  }

  /** Full player profile with season, career, and yearByYear for year picker */
  getPerson(personId: number) {
    return this.get<any>(`v1/people/${personId}`, {
      hydrate: 'stats(group=[hitting,pitching],type=[season,career,yearByYear],gameType=R),currentTeam,primaryPosition'
    });
  }

  /** Fetch season stats for a specific prior year */
  getPlayerStatsBySeason(personId: number, season: number) {
    return this.get<any>(`v1/people/${personId}/stats`, {
      stats: 'season',
      group: 'hitting,pitching',
      season,
      gameType: 'R'
    });
  }

  /** Fetch game-by-game log for a player */
  getPlayerGameLog(personId: number, group: 'hitting' | 'pitching', season: number) {
    return this.get<any>(`v1/people/${personId}/stats`, {
      stats: 'gameLog',
      group,
      season,
      gameType: 'R'
    });
  }

  getPlayByPlay(gamePk: number) {
    return this.get<any>(`v1/game/${gamePk}/playByPlay`, {
      hydrate: 'pitchData,hitData'
    });
  }

  getLiveFeed(gamePk: number) {
    // Use v1.1 — the v1 feed/live endpoint returns an empty gameData object.
    return this.get<any>(`v1.1/game/${gamePk}/feed/live`, {
      hydrate: 'pitchData,hitData'
    });
  }

  /** Full roster of MLB players for a given season (used by Player search). */
  getAllPlayers(season: number) {
    return this.get<any>('v1/sports/1/players', { season });
  }

  /**
   * Direct name search via the MLB people search endpoint.
   * Queries both active and inactive players in parallel so historical/retired
   * players are also returned, then merges by id and limits the result set.
   */
  searchPlayers(query: string, limit = 30) {
    const active$ = this.get<any>('v1/people/search', {
      names: query, sportId: 1, active: true, limit
    }).pipe(catchError(() => of({ people: [] })));

    const inactive$ = this.get<any>('v1/people/search', {
      names: query, sportId: 1, active: false, limit
    }).pipe(catchError(() => of({ people: [] })));

    return forkJoin([active$, inactive$]).pipe(
      map(([a, b]) => {
        const seen = new Set<number>();
        const merged: any[] = [];
        const pushAll = (arr: any[] | undefined) => {
          for (const p of arr ?? []) {
            if (!p?.id || seen.has(p.id)) continue;
            seen.add(p.id);
            merged.push(p);
          }
        };
        // Active players first so currently-playing matches rank higher.
        pushAll(a?.people);
        pushAll(b?.people);
        return { people: merged.slice(0, limit) };
      })
    );
  }

  /**
   * Team roster for a season hydrated with each player's season fielding splits
   * (one split per position they appeared at, including gamesStarted / games).
   * This drives the team Depth Chart.
   */
  getTeamRosterWithFielding(teamId: number, season: number) {
    return this.get<any>(`v1/teams/${teamId}/roster`, {
      rosterType: 'fullSeason',
      season,
      hydrate: `person(stats(group=[fielding],type=[season],season=${season}))`
    });
  }

  /**
   * Searches the next 90 days of schedule for a makeup game that was rescheduled
   * from the given original gamePk. Returns the raw game object or null.
   * Filters by one of the two teams to keep the response small.
   */
  findMakeupGame(homeTeamId: number, originalGamePk: number) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const start = new Date();
    const end   = new Date(); end.setDate(end.getDate() + 90);
    return this.get<any>('v1/schedule', {
      sportId: 1,
      teamId: homeTeamId,
      startDate: fmt(start),
      endDate: fmt(end),
      hydrate: 'team'
    });
  }

  /** Plain active roster as a fallback when the fullSeason roster is empty (pre-season). */
  getTeamActiveRoster(teamId: number, season: number) {
    return this.get<any>(`v1/teams/${teamId}/roster`, {
      rosterType: 'active',
      season,
      hydrate: `person(stats(group=[fielding],type=[season],season=${season}))`
    });
  }
}