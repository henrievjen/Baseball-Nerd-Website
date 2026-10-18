import { of, throwError } from 'rxjs';
import { LeagueStandingsService, buildBundle, gamesOf } from './league-standings.service';
import { leagueProfile } from './league-profile';

const rec = (w1: number, l1: number, w2: number, l2: number) => ({
  records: [{ league: { id: 113, name: 'Eastern League' }, division: { id: 1, name: 'Eastern League East' }, teamRecords: [
    { team: { id: 1, name: 'A' }, wins: w1, losses: l1 }, { team: { id: 2, name: 'B' }, wins: w2, losses: l2 }
  ] }]
});

describe('buildBundle', () => {
  it('offers halves only when each holds some, but not all, of the season', () => {
    const b = buildBundle(2025, [113], { full: rec(70, 60, 60, 70), first: rec(35, 30, 30, 35), second: rec(35, 30, 30, 35) });
    expect(b.periods).toEqual(['full', 'first', 'second']);
    expect(b.views.first!.games).toBe(130);
  });

  it('skips a half the feed answers with the whole season, or leaves empty', () => {
    const b = buildBundle(2025, [113], { full: rec(70, 60, 60, 70), first: rec(70, 60, 60, 70), second: { records: [] } });
    expect(b.periods).toEqual(['full']);
    expect(b.views.first).toBeUndefined();
  });

  it('during the first half there is no second half to show', () => {
    const b = buildBundle(2026, [113], { full: rec(10, 5, 5, 10), first: rec(10, 5, 5, 10), second: rec(0, 0, 0, 0) });
    expect(b.periods).toEqual(['full']);
  });

  it('keeps "no postseason loaded" (null) apart from "no postseason" (empty)', () => {
    expect(buildBundle(2025, [1], { full: rec(1, 1, 1, 1), postseason: null }).postseason).toBeNull();
    expect(buildBundle(2025, [1], { full: rec(1, 1, 1, 1), postseason: [] }).postseason!.games).toBe(0);
  });

  it('gamesOf flattens the schedule dates', () => {
    expect(gamesOf({ dates: [{ games: [{ gamePk: 1 }, { gamePk: 2 }] }, { games: [{ gamePk: 3 }] }] }).length).toBe(3);
    expect(gamesOf(null)).toEqual([]);
  });
});

describe('LeagueStandingsService.load', () => {
  function fakeApi(over: Partial<Record<string, any>> = {}) {
    const calls: any[] = [];
    const api = {
      getSportLeagues: (sportId: number, season: number) => { calls.push(['leagues', sportId, season]); return over['leagues'] ?? of({ leagues: [{ id: 113 }, { id: 111 }] }); },
      getLeagueStandings: (ids: number[], season: number, type = 'regularSeason') => { calls.push(['standings', ids.join(','), season, type]); return over[type] ?? of(rec(70, 60, 60, 70)); },
      getLeaguePostseasonGames: (sportId: number, ids: number[], season: number) => { calls.push(['post', sportId, ids.join(','), season]); return over['post'] ?? of({ dates: [] }); }
    };
    return { api: api as any, calls };
  }

  it('looks up a minor-league level\'s leagues for the season, then loads them together (with halves for split levels)', done => {
    const { api, calls } = fakeApi();
    new LeagueStandingsService(api).load(leagueProfile('aa')!, 2025).subscribe(b => {
      expect(calls.map(c => c[0] + ':' + (c[0] === 'standings' ? c[3] : c[1]))).toEqual(
        jasmine.arrayContaining(['leagues:12', 'standings:regularSeason', 'standings:firstHalf', 'standings:secondHalf', 'post:12']));
      expect(calls.find(c => c[0] === 'standings')![1]).toBe('113,111');
      expect(b.leagueIds).toEqual([113, 111]);
      done();
    });
  });

  it('uses the registry\'s league ids for a winter league and skips halves', done => {
    const { api, calls } = fakeApi();
    new LeagueStandingsService(api).load(leagueProfile('lmp')!, 2025).subscribe(b => {
      expect(calls.some(c => c[0] === 'leagues')).toBeFalse();
      expect(calls.filter(c => c[0] === 'standings').length).toBe(1);
      expect(calls.find(c => c[0] === 'post')![2]).toBe('132');
      expect(b.periods).toEqual(['full']);
      done();
    });
  });

  it('caches the league lookup per sport and season', done => {
    const { api, calls } = fakeApi();
    const svc = new LeagueStandingsService(api);
    svc.load(leagueProfile('aaa')!, 2025).subscribe(() => {
      svc.load(leagueProfile('aaa')!, 2025).subscribe(() => {
        expect(calls.filter(c => c[0] === 'leagues').length).toBe(1);
        done();
      });
    });
  });

  it('a failed postseason or half request does not lose the standings', done => {
    const { api } = fakeApi({ post: throwError(() => new Error('x')), firstHalf: throwError(() => new Error('x')) });
    new LeagueStandingsService(api).load(leagueProfile('aa')!, 2025).subscribe(b => {
      expect(b.views.full!.blocks.length).toBe(1);
      expect(b.postseason).toBeNull();
      expect(b.periods).toEqual(['full']);
      done();
    });
  });

  it('a failed standings request is an error', done => {
    const { api } = fakeApi({ regularSeason: throwError(() => new Error('boom')) });
    new LeagueStandingsService(api).load(leagueProfile('aaa')!, 2025).subscribe({ error: e => { expect(e.message).toBe('boom'); done(); } });
  });

  it('a sport with no leagues that season gives an empty bundle without more requests', done => {
    const { api, calls } = fakeApi({ leagues: of({ leagues: [] }) });
    new LeagueStandingsService(api).load(leagueProfile('rok')!, 1999).subscribe(b => {
      expect(b.views.full!.blocks).toEqual([]);
      expect(calls.length).toBe(1);
      done();
    });
  });
});
