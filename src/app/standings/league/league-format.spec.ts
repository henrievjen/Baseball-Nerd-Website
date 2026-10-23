import { describePostseason, formatRules, qualifyingCut } from './league-format';
import { buildLeaguePostseason } from './league-postseason-model';
import { LEAGUES } from '../../shared/leagues';
import { leagueProfile } from './league-profile';

const T = (id: number) => ({ id, name: `Team ${id}` });
let pk = 5000;
function game(desc: string, type: string, inSeries: number, away: number, home: number, score: [number, number] | null, date = '2025-12-20') {
  const state = score ? 'Final' : 'Preview';
  return {
    gamePk: pk++, gameType: type, seriesDescription: desc, gamesInSeries: inSeries, officialDate: date,
    status: { abstractGameState: state, detailedState: state },
    teams: {
      away: { team: T(away), score: score?.[0], isWinner: score ? score[0] > score[1] : undefined },
      home: { team: T(home), score: score?.[1], isWinner: score ? score[1] > score[0] : undefined }
    }
  };
}
/** A best-of series where `a` (host of game 1) wins `wa` and `b` wins `wb`. */
function series(desc: string, type: string, bestOf: number, a: number, b: number, wa: number, wb: number, date: string) {
  const out: any[] = [];
  let ga = 0, gb = 0, n = 0;
  while (ga < wa || gb < wb) {
    const aWins = ga < wa && (gb >= wb || n % 2 === 0);
    if (aWins) ga++; else gb++;
    const aHome = n % 2 === 0;
    out.push(game(desc, type, bestOf, aHome ? b : a, aHome ? a : b, aWins === aHome ? [2, 5] : [5, 2], `${date.slice(0, 8)}${String(+date.slice(8) + n).padStart(2, '0')}`));
    n++;
  }
  return out;
}

describe('formatRules', () => {
  it('has a confirmed rules text for every league except MLB and the International (event) level', () => {
    for (const l of LEAGUES.filter(x => x.id !== 'mlb' && x.id !== 'intl')) {
      const p = leagueProfile(l.id)!;
      expect(formatRules(l.id, p.firstSeason)).withContext(l.id).not.toBeNull();
    }
    expect(formatRules('mlb', 2025)).toBeNull();
    expect(formatRules('nope', 2025)).toBeNull();
  });

  it('labels the season the rules were confirmed for — "2025–26" for a winter league', () => {
    const r = formatRules('lidom', 2025)!;
    expect(r.exact).toBeTrue();
    expect(r.confirmedFor).toBe('2025–26');
  });

  it('flags a season other than the confirmed one, and points at the confirmed season', () => {
    const r = formatRules('aaa', 2015)!;
    expect(r.exact).toBeFalse();
    expect(r.confirmedFor).toBe('2026');
  });

  it('says what each league\'s postseason is, in the verified terms', () => {
    expect(formatRules('lmp', 2025)!.text).toMatch(/top eight/);
    expect(formatRules('lmp', 2025)!.text).toMatch(/points table/);
    expect(formatRules('lvbp', 2025)!.text).toMatch(/round robin/);
    expect(formatRules('abl', 2025)!.text).toMatch(/best-of-3/);
    expect(formatRules('npb', 2025)!.text).toMatch(/top three/i);
    expect(formatRules('aaa', 2026)!.text).toMatch(/National Championship/);
  });
});

describe('qualifyingCut', () => {
  it('NPB: the top three in each league reach the Climax Series', () => {
    const c = qualifyingCut('npb', 2026)!;
    expect(c.spots).toBe(3);
    expect(c.badge).toBe('CS');
  });
  it('is only drawn where the table alone decides the postseason places', () => {
    expect(qualifyingCut('lmp', 2025)).toBeNull();
    expect(qualifyingCut('aaa', 2026)).toBeNull();
    expect(qualifyingCut('npb', 2019)).toBeNull();
  });
});

describe('describePostseason', () => {
  it('is empty without postseason games', () => {
    expect(describePostseason(buildLeaguePostseason([]))).toEqual([]);
  });

  it('outlines a Mexican Pacific League style bracket: 8 teams, every round best of 7', () => {
    const games = [
      ...series('LMP First Round', 'D', 7, 1, 8, 4, 2, '2026-01-01'),
      ...series('LMP First Round', 'D', 7, 2, 7, 4, 1, '2026-01-01'),
      ...series('LMP First Round', 'D', 7, 3, 6, 4, 3, '2026-01-01'),
      ...series('LMP First Round', 'D', 7, 4, 5, 1, 4, '2026-01-01'),
      ...series('LMP Semifinals', 'L', 7, 1, 5, 4, 1, '2026-01-11'),
      ...series('LMP Semifinals', 'L', 7, 2, 3, 2, 4, '2026-01-11'),
      ...series('LMP Championship', 'W', 7, 1, 3, 4, 2, '2026-01-21')
    ];
    const lines = describePostseason(buildLeaguePostseason(games));
    expect(lines[0]).toBe('8 teams played in the postseason.');
    expect(lines[1]).toBe('LMP First Round (4 series, best of 7) → LMP Semifinals (2 series, best of 7) → LMP Championship (best of 7)');
  });

  it('puts a round robin before the final that follows it (LIDOM style)', () => {
    const rr: any[] = [];
    const teams = [1, 2, 3, 4];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) rr.push(game('Round Robin', 'P', 18, teams[i], teams[j], [3, 2], `2026-01-0${r + 1}`));
    const games = [...series('Finals', 'W', 7, 1, 2, 4, 1, '2026-01-20'), ...rr];
    const v = buildLeaguePostseason(games);
    const lines = describePostseason(v);
    expect(lines[0]).toBe('4 teams played in the postseason.');
    expect(lines[1]).toBe('Round Robin (round robin: 4 teams, 18 games)');
    expect(lines[2]).toBe('Finals (best of 7)');
  });

  it('lists a bracket per league when the minors run several, titled by its championship', () => {
    const games = [
      ...series('SAL Division Series', 'L', 3, 1, 2, 2, 1, '2025-09-09'),
      ...series('SAL Championship Series', 'W', 3, 1, 3, 2, 0, '2025-09-14'),
      ...series('MWL Championship Series', 'W', 5, 21, 22, 3, 1, '2025-09-09')
    ];
    const lines = describePostseason(buildLeaguePostseason(games));
    expect(lines[0]).toBe('5 teams played in the postseason.');
    expect(lines).toContain('MWL Championship Series (best of 5)');
    expect(lines).toContain('SAL Division Series (best of 3) → SAL Championship Series (best of 3)');
  });

  it('collapses brackets that read the same into one line', () => {
    const games = [
      ...series('Division Series', 'L', 3, 1, 2, 2, 1, '2025-09-09'),
      ...series('Championship Series', 'W', 3, 1, 3, 2, 0, '2025-09-14'),
      ...series('Division Series', 'L', 3, 11, 12, 1, 2, '2025-09-09'),
      ...series('Championship Series', 'W', 3, 12, 13, 2, 1, '2025-09-14')
    ];
    const lines = describePostseason(buildLeaguePostseason(games));
    expect(lines.length).toBe(2);
    expect(lines[1]).toBe('Division Series (best of 3) → Championship Series (best of 3) · 2 brackets');
  });
});
