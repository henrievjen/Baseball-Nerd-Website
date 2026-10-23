import { of, throwError } from 'rxjs';
import { NPB_FIRST_SEASON, npbSeasonUrl, parseNpbSeason } from './npb-data';
import { NpbDataService } from './npb-data.service';

const team = (id: number, abbrev: string, division = 'Central League') => ({ id, name: `${abbrev} club`, abbrev, league: 'NPB', division });
const raw = (over: any = {}) => ({
  gamePk: '2026032701085',
  gameDate: '2026-03-27T18:00:00+09:00',
  officialDate: '2026-03-27',
  stage: null,
  status: { detailedState: 'Final', abstractGameState: 'F' },
  teams: { away: { team: team(3001, 'YOM'), score: 3, isWinner: true }, home: { team: team(3002, 'HAN'), score: 1, isWinner: false } },
  isTie: false,
  ...over
});

describe('parseNpbSeason', () => {
  it('keeps the games in source order', () => {
    const s = parseNpbSeason([raw(), raw({ gamePk: '2', officialDate: '2026-03-28' }), raw({ gamePk: '3' })]);
    expect(s.games.map(g => g.gamePk)).toEqual(['2026032701085', '2', '3']);
  });

  it('drops malformed and duplicated entries', () => {
    const s = parseNpbSeason([raw(), raw(), { gamePk: 'x' }, null, raw({ gamePk: '9', officialDate: 'March 3' }), raw({ gamePk: '8', teams: { away: {}, home: {} } })]);
    expect(s.games.length).toBe(1);
  });

  it('accepts a { games: [] } wrapper and rejects anything that is not a game list', () => {
    expect(parseNpbSeason({ games: [raw()] }).games.length).toBe(1);
    expect(() => parseNpbSeason({ nope: true })).toThrow();
    expect(() => parseNpbSeason('<html>')).toThrow();
  });
});

describe('NpbDataService', () => {
  const json = [raw(), raw({ gamePk: '2', officialDate: '2026-03-28' })];
  function svc(get: (url: string) => any) {
    const urls: string[] = [];
    const http: any = { get: (u: string) => { urls.push(u); return get(u); } };
    return { svc: new NpbDataService(http), urls };
  }

  it('downloads each season once and reuses it', done => {
    const { svc: s, urls } = svc(() => of(json));
    s.getSeason(2026).subscribe(a => {
      s.getSeason(2026).subscribe(b => {
        expect(a.games.length).toBe(2);
        expect(b).toBe(a);
        expect(urls).toEqual([npbSeasonUrl(2026)]);
        done();
      });
    });
  });

  it('a year before the data starts is empty without any request', done => {
    const { svc: s, urls } = svc(() => of(json));
    s.getSeason(NPB_FIRST_SEASON - 1).subscribe(a => {
      expect(a.games).toEqual([]);
      expect(urls.length).toBe(0);
      done();
    });
  });

  it('a season file that does not exist yet (404) is empty, not an error', done => {
    const { svc: s } = svc(() => throwError(() => ({ status: 404 })));
    s.getSeason(2099).subscribe(a => { expect(a.games).toEqual([]); done(); });
  });

  it('other failures are errors and are not cached, so the next call retries', done => {
    let n = 0;
    const { svc: s, urls } = svc(() => (++n === 1 ? throwError(() => ({ status: 500 })) : of(json)));
    s.getSeason(2026).subscribe({
      error: e => {
        expect(e.status).toBe(500);
        s.getSeason(2026).subscribe(a => {
          expect(a.games.length).toBe(2);
          expect(urls.length).toBe(2);
          done();
        });
      }
    });
  });

  it('a payload that is not a game list is an error', done => {
    const { svc: s } = svc(() => of({ message: 'rate limited' }));
    s.getSeason(2026).subscribe({ error: () => done() });
  });
});
