import { of, throwError } from 'rxjs';
import { LeagueStandingsService, buildBundle, gamesOf } from './league-standings.service';
import { leagueProfile } from './league-profile';

const npbStub = (games: any[] = []): any => ({ getSeason: () => of({ games }) });

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
    new LeagueStandingsService(api, npbStub()).load(leagueProfile('aa')!, 2025).subscribe(b => {
      expect(calls.map(c => c[0] + ':' + (c[0] === 'standings' ? c[3] : c[1]))).toEqual(
        jasmine.arrayContaining(['leagues:12', 'standings:regularSeason', 'standings:firstHalf', 'standings:secondHalf', 'post:12']));
      expect(calls.find(c => c[0] === 'standings')![1]).toBe('113,111');
      expect(b.leagueIds).toEqual([113, 111]);
      done();
    });
  });

  it('uses the registry\'s league ids for a winter league, and asks for its halves (the feed splits the LMP season)', done => {
    const { api, calls } = fakeApi();
    new LeagueStandingsService(api, npbStub()).load(leagueProfile('lmp')!, 2025).subscribe(b => {
      expect(calls.some(c => c[0] === 'leagues')).toBeFalse();
      expect(calls.filter(c => c[0] === 'standings').map(c => c[3])).toEqual(jasmine.arrayContaining(['regularSeason', 'firstHalf', 'secondHalf']));
      expect(calls.find(c => c[0] === 'post')![2]).toBe('132');
      expect(b.periods).toEqual(['full']);   // the fake answers each half with the whole season, so none is offered
      done();
    });
  });

  it('a league with no halves (LIDOM) asks for the full season only', done => {
    const { api, calls } = fakeApi();
    new LeagueStandingsService(api, npbStub()).load(leagueProfile('lidom')!, 2025).subscribe(() => {
      expect(calls.filter(c => c[0] === 'standings').length).toBe(1);
      done();
    });
  });

  it('Triple-A offers its first and second half when the feed splits the season', done => {
    const { api } = fakeApi({ firstHalf: of(rec(35, 30, 30, 35)), secondHalf: of(rec(35, 30, 30, 35)) });
    new LeagueStandingsService(api, npbStub()).load(leagueProfile('aaa')!, 2026).subscribe(b => {
      expect(b.periods).toEqual(['full', 'first', 'second']);
      done();
    });
  });

  it('caches the league lookup per sport and season', done => {
    const { api, calls } = fakeApi();
    const svc = new LeagueStandingsService(api, npbStub());
    svc.load(leagueProfile('aaa')!, 2025).subscribe(() => {
      svc.load(leagueProfile('aaa')!, 2025).subscribe(() => {
        expect(calls.filter(c => c[0] === 'leagues').length).toBe(1);
        done();
      });
    });
  });

  it('a failed postseason or half request does not lose the standings', done => {
    const { api } = fakeApi({ post: throwError(() => new Error('x')), firstHalf: throwError(() => new Error('x')) });
    new LeagueStandingsService(api, npbStub()).load(leagueProfile('aa')!, 2025).subscribe(b => {
      expect(b.views.full!.blocks.length).toBe(1);
      expect(b.postseason).toBeNull();
      expect(b.periods).toEqual(['full']);
      done();
    });
  });

  it('a failed standings request is an error', done => {
    const { api } = fakeApi({ regularSeason: throwError(() => new Error('boom')) });
    new LeagueStandingsService(api, npbStub()).load(leagueProfile('aaa')!, 2025).subscribe({ error: e => { expect(e.message).toBe('boom'); done(); } });
  });

  it('a sport with no leagues that season gives an empty bundle without more requests', done => {
    const { api, calls } = fakeApi({ leagues: of({ leagues: [] }) });
    new LeagueStandingsService(api, npbStub()).load(leagueProfile('rok')!, 1999).subscribe(b => {
      expect(b.views.full!.blocks).toEqual([]);
      expect(calls.length).toBe(1);
      done();
    });
  });
});

describe('LeagueStandingsService.load for NPB', () => {
  const game = (pk: string, away: number, home: number, a: number | null, h: number | null, state = 'Final', date = '2026-05-01') => ({
    gamePk: pk, gameDate: `${date}T18:00:00+09:00`, officialDate: date,
    status: { detailedState: state },
    teams: {
      away: { team: { id: away, name: `Team ${away}`, abbrev: `T${away}`, division: 'Central League' }, score: a },
      home: { team: { id: home, name: `Team ${home}`, abbrev: `T${home}`, division: 'Central League' }, score: h }
    }
  });

  it('builds tables from the NPB data set without touching the MLB Stats API', done => {
    const api: any = new Proxy({}, { get: () => () => { throw new Error('MLB API must not be called for NPB'); } });
    const games = [game('1', 1, 2, 5, 3), game('2', 1, 2, 2, 2, 'Final', '2026-05-02')];
    new LeagueStandingsService(api, npbStub(games)).load(leagueProfile('npb')!, 2024).subscribe(b => {
      expect(b.season).toBe(2024);
      expect(b.periods).toEqual(['full']);
      expect(b.views.full!.showTies).toBeTrue();
      expect(b.views.full!.blocks[0].table.map(r => [r.teamName, r.wins, r.losses, r.ties])).toEqual([['Team 1', 1, 0, 1], ['Team 2', 0, 1, 1]]);
      expect(b.postseason!.games).toBe(0);
      expect(b.through).toBe('2026-05-02');
      done();
    });
  });

  it('2026: the postseason is the bundled Climax Series / Japan Series, with its last-updated date — and never polls the MLB API', done => {
    const api: any = new Proxy({}, { get: () => () => { throw new Error('MLB API must not be called for NPB'); } });
    const svc = new LeagueStandingsService(api, npbStub([game('1', 1, 2, 5, 3)]));
    svc.load(leagueProfile('npb')!, 2026).subscribe(b => {
      expect(b.postseasonSource).toEqual({ kind: 'bundled', updated: '2026-10-22' });
      expect(b.postseason!.brackets.map(x => x.title)).toEqual(['Central League Climax Series', 'Pacific League Climax Series', 'Japan Series']);
      svc.postseason(leagueProfile('npb')!, 2026, []).subscribe(v => { expect(v).toBeNull(); done(); });
    });
  });

  it('a season with no finished games is an empty bundle (the page then steps back a season)', done => {
    const api: any = {};
    new LeagueStandingsService(api, npbStub([game('1', 1, 2, null, null, 'Scheduled')])).load(leagueProfile('npb')!, 2026).subscribe(b => {
      expect(b.views.full!.blocks).toEqual([]);
      expect(b.through).toBeUndefined();
      done();
    });
  });

  it('a failed NPB download is an error', done => {
    const api: any = {};
    const npb: any = { getSeason: () => throwError(() => new Error('offline')) };
    new LeagueStandingsService(api, npb).load(leagueProfile('npb')!, 2026).subscribe({ error: e => { expect(e.message).toBe('offline'); done(); } });
  });
});
