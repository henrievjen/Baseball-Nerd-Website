import { of, throwError } from 'rxjs';
import { LeagueScoresService, matchLeague, planRequests } from './league-scores.service';
import { LEAGUES, leagueById, leagueGroups, sanitizeLeagueIds, scoreLeagues } from './leagues';

const defs = (...ids: string[]) => ids.map(id => leagueById(id)!);

describe('planRequests', () => {
  it('sends MLB alone as sportId 1 with the full hydration', () => {
    const plans = planRequests(defs('mlb'));
    expect(plans.length).toBe(1);
    expect(plans[0].mlb).toBeTrue();
    expect(plans[0].sportId).toBe('1');
    expect(plans[0].leagueId).toBeUndefined();
  });

  it('folds leagues that share a sport into one leagueId-filtered request', () => {
    const plans = planRequests(defs('afl', 'lvbp'));
    expect(plans.length).toBe(1);
    expect(plans[0].sportId).toBe('17');
    expect(plans[0].leagueId).toBe('119,135');
    expect(plans[0].mlb).toBeFalse();
  });

  it('keeps "All leagues" to three requests', () => {
    const plans = planRequests(scoreLeagues());
    expect(plans.length).toBe(3);
    expect(plans[0].sportId).toBe('1');
    expect(plans[1].sportId).toBe('17');
    expect(plans[1].leagueId).toBe('119,131,132,135,133,595,162');
    expect(plans[2].sportId).toBe('11,12,13,14,16,51');
    expect(plans[2].leagueId).toBeUndefined();
  });

  it('returns nothing for an empty selection', () => {
    expect(planRequests([])).toEqual([]);
  });

  it('never sends a league from another provider (NPB) to the MLB Stats API', () => {
    expect(planRequests(defs('npb'))).toEqual([]);
    expect(planRequests(defs('mlb', 'npb', 'aaa')).map(p => p.sportId)).toEqual(['1', '11']);
  });
});

describe('matchLeague', () => {
  const game = (leagueId?: number, sportId?: number) => ({
    teams: { home: { team: { league: { id: leagueId }, sport: { id: sportId } } }, away: { team: {} } }
  });

  it('uses the only league in a request without looking at the game', () => {
    expect(matchLeague(game(), defs('mlb')).id).toBe('mlb');
  });

  it('tells winter leagues apart by league id', () => {
    expect(matchLeague(game(135), defs('afl', 'lvbp')).id).toBe('lvbp');
    expect(matchLeague(game(119), defs('afl', 'lvbp')).id).toBe('afl');
  });

  it('tells minor-league levels apart by sport id', () => {
    expect(matchLeague(game(undefined, 12), defs('aaa', 'aa', 'intl')).id).toBe('aa');
  });

  it('files anything unrecognised under the catch-all league', () => {
    expect(matchLeague(game(999, 999), defs('aaa', 'aa', 'intl')).id).toBe('intl');
  });
});

describe('sanitizeLeagueIds', () => {
  it('drops unknown ids and duplicates and uses registry order', () => {
    expect(sanitizeLeagueIds(['lvbp', 'nope', 'mlb', 'lvbp'])).toEqual(['mlb', 'lvbp']);
  });

  it('leaves out NPB, which only has standings', () => {
    expect(sanitizeLeagueIds(['npb', 'afl'])).toEqual(['afl']);
    expect(sanitizeLeagueIds(['npb'])).toEqual(['mlb']);
  });

  it('falls back to MLB when nothing valid is left', () => {
    expect(sanitizeLeagueIds(['nope'])).toEqual(['mlb']);
    expect(sanitizeLeagueIds([])).toEqual(['mlb']);
    expect(sanitizeLeagueIds(null)).toEqual(['mlb']);
  });
});

describe('LeagueScoresService.getGames', () => {
  const mlbGame = { gamePk: 1, teams: { home: { team: { id: 119 } }, away: { team: { id: 158 } } } };
  const aflGame = { gamePk: 2, teams: { home: { team: { league: { id: 119 } } }, away: { team: {} } } };
  const lvbpGame = { gamePk: 3, teams: { home: { team: { league: { id: 135 } } }, away: { team: {} } } };

  it('queries MLB with defaults and other leagues with their own params, and tags every game', done => {
    const calls: any[] = [];
    const api: any = {
      getSchedule: (opts: any) => {
        calls.push(opts);
        const games = opts.sportId === '17' ? [aflGame, lvbpGame] : [mlbGame];
        return of({ dates: [{ games }] });
      }
    };
    new LeagueScoresService(api).getGames(['mlb', 'afl', 'lvbp'], '2026-10-12').subscribe(res => {
      expect(calls.length).toBe(2);
      expect(calls[0]).toEqual({ date: '2026-10-12' });
      expect(calls[1].sportId).toBe('17');
      expect(calls[1].leagueId).toBe('119,135');
      expect(calls[1].date).toBe('2026-10-12');
      expect(res.failed).toEqual([]);
      expect(res.games.map((g: any) => g._leagueId).sort()).toEqual(['afl', 'lvbp', 'mlb']);
      done();
    });
  });

  it('reports a failed league without losing the others', done => {
    const api: any = {
      getSchedule: (opts: any) =>
        opts.sportId === '17' ? throwError(() => new Error('boom')) : of({ dates: [{ games: [mlbGame] }] })
    };
    new LeagueScoresService(api).getGames(['mlb', 'afl', 'lvbp'], '2026-10-12').subscribe(res => {
      expect(res.failed.sort()).toEqual(['afl', 'lvbp']);
      expect(res.games.length).toBe(1);
      expect(res.games[0]._leagueId).toBe('mlb');
      done();
    });
  });

  it('copes with an empty schedule', done => {
    const api: any = { getSchedule: () => of({ dates: [] }) };
    new LeagueScoresService(api).getGames(['mlb'], '2026-02-01').subscribe(res => {
      expect(res).toEqual({ games: [], failed: [] });
      done();
    });
  });
});

describe('league registry pages', () => {
  it('the Scores page offers every league except NPB; the Standings page offers all of them', () => {
    expect(scoreLeagues().map(l => l.id)).not.toContain('npb');
    expect(scoreLeagues().length).toBe(LEAGUES.length - 1);
    const onScores = leagueGroups(true);
    expect(onScores.map(g => g.id)).toEqual(['majors', 'fall-winter', 'minors', 'international']);
    const onStandings = leagueGroups();
    expect(onStandings.map(g => g.id)).toEqual(['majors', 'asia', 'fall-winter', 'minors', 'international']);
    expect(onStandings.find(g => g.id === 'asia')!.leagues.map(l => l.id)).toEqual(['npb']);
  });
});
