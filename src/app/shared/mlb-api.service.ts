import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

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
      hydrate: 'linescore,team,broadcasts,decisions,probablePitcher(stats(group=[pitching],type=[season],gameType=R))',
      ...opts
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

  getStatsLeaders(key: string, group: string, season: number) {
    return this.get<any>('v1/stats/leaders', {
      leaderCategories: key, statGroup: group,
      season, limit: 50, statType: 'season'
    });
  }

  getPerson(personId: number) {
    return this.get<any>(`v1/people/${personId}`, {
      hydrate: 'stats(group=[hitting,pitching],type=[season,career],gameType=R),currentTeam,primaryPosition'
    });
  }

  getPlayByPlay(gamePk: number) {
    return this.get<any>(`v1/game/${gamePk}/playByPlay`, {
      hydrate: 'pitchData,hitData'
    });
  }

  /** Live feed — includes current at-bat, matchup, and all pitch coordinates */
  getLiveFeed(gamePk: number) {
    return this.get<any>(`v1/game/${gamePk}/feed/live`);
  }
}
