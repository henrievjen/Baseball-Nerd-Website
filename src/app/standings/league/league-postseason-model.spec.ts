import { buildLeaguePostseason } from './league-postseason-model';

const T = (id: number, name = `Team ${id}`) => ({ id, name });
let pk = 1;
/** One game. `winner` = 'a' | 'h' for a final; omit `state` for a Final. */
function game(desc: string | undefined, type: string, inSeries: number, away: number, home: number,
              score: [number, number] | null, o: { date?: string; state?: string; pk?: number; detailed?: string } = {}) {
  const state = o.state ?? (score ? 'Final' : 'Preview');
  return {
    gamePk: o.pk ?? pk++,
    gameType: type,
    seriesDescription: desc,
    gamesInSeries: inSeries,
    officialDate: o.date ?? '2025-12-20',
    status: { abstractGameState: state, detailedState: o.detailed ?? state },
    teams: {
      away: { team: T(away), score: score?.[0], isWinner: score ? score[0] > score[1] : undefined },
      home: { team: T(home), score: score?.[1], isWinner: score ? score[1] > score[0] : undefined }
    }
  };
}
/** A best-of series: results listed as winners of each game, 'h' = team a wins (a hosts game 1). */
function series(desc: string, type: string, bestOf: number, a: number, b: number, winsOfA: number, winsOfB: number, date = '2025-12-20') {
  const out: any[] = [];
  let ga = 0, gb = 0, n = 0;
  while (ga < winsOfA || gb < winsOfB) {
    const aWins = ga < winsOfA && (gb >= winsOfB || n % 2 === 0);
    if (aWins) ga++; else gb++;
    // team a hosts the odd games
    const aHome = n % 2 === 0;
    const winnerIsHome = aWins === aHome;
    out.push(game(desc, type, bestOf, aHome ? b : a, aHome ? a : b, winnerIsHome ? [2, 5] : [5, 2], { date: `${date.slice(0, 8)}${String(+date.slice(8) + n).padStart(2, '0')}` }));
    n++;
  }
  return out;
}

describe('buildLeaguePostseason', () => {
  it('returns an empty view when there are no games', () => {
    expect(buildLeaguePostseason([])).toEqual({ robins: [], brackets: [], pending: false, games: 0 });
    expect(buildLeaguePostseason(null).games).toBe(0);
  });

  it('builds a 3-round bracket (first round → semifinals → championship) with a champion', () => {
    const games = [
      ...series('LMP First Round', 'D', 7, 1, 8, 4, 2, '2025-12-20'),
      ...series('LMP First Round', 'D', 7, 4, 5, 1, 4, '2025-12-20'),
      ...series('LMP First Round', 'D', 7, 2, 7, 4, 0, '2025-12-20'),
      ...series('LMP First Round', 'D', 7, 3, 6, 4, 3, '2025-12-20'),
      ...series('LMP Semifinals', 'L', 7, 1, 5, 4, 1, '2026-01-02'),
      ...series('LMP Semifinals', 'L', 7, 2, 3, 2, 4, '2026-01-02'),
      ...series('LMP Championship', 'W', 7, 1, 3, 4, 2, '2026-01-12')
    ];
    const v = buildLeaguePostseason(games);
    expect(v.brackets.length).toBe(1);
    const b = v.brackets[0];
    expect(b.title).toBeNull();
    expect(b.rounds.map(r => `${r.name}:${r.series.length}`)).toEqual(['LMP First Round:4', 'LMP Semifinals:2', 'LMP Championship:1']);
    const first = b.rounds[0].series;
    expect(first.every(s => s.bestOf === 7 && s.status === 'final' && s.winner !== null)).toBeTrue();
    expect(first.find(s => s.teams.some(t => t.id === 1))!.score).toEqual([4, 2]);
    expect(b.champion!.id).toBe(1);
    expect(v.pending).toBeFalse();
  });

  it('lines each round up with the series its winners feed into', () => {
    const games = [
      ...series('R1', 'D', 3, 1, 8, 2, 0, '2025-12-20'),   // → semi A (1 vs 4)
      ...series('R1', 'D', 3, 2, 7, 0, 2, '2025-12-20'),   // 7 → semi B
      ...series('R1', 'D', 3, 3, 6, 0, 2, '2025-12-20'),   // 6 → semi B
      ...series('R1', 'D', 3, 4, 5, 2, 0, '2025-12-20'),   // 4 → semi A
      ...series('R2', 'L', 3, 1, 4, 2, 0, '2026-01-02'),
      ...series('R2', 'L', 3, 7, 6, 2, 0, '2026-01-02'),
      ...series('R3', 'W', 3, 1, 7, 2, 1, '2026-01-12')
    ];
    const rounds = buildLeaguePostseason(games).brackets[0].rounds;
    const ids = (i: number) => rounds[i].series.map(s => s.teams.map(t => t.id).sort().join('v'));
    expect(ids(1)).toEqual(['1v4', '6v7']);
    // first-round series sit next to the semifinal they feed
    expect(ids(0)).toEqual(['1v8', '4v5', '2v7', '3v6']);
  });

  it('shows byes: a team that skips round one appears first in round two', () => {
    const games = [
      ...series('AFL First Round', 'D', 1, 3, 4, 1, 0, '2025-11-12'),
      ...series('AFL Semifinals', 'L', 1, 1, 3, 0, 1, '2025-11-13'),
      ...series('AFL Semifinals', 'L', 1, 2, 5, 1, 0, '2025-11-13'),
      ...series('AFL Championship Game', 'W', 1, 3, 2, 1, 0, '2025-11-14')
    ];
    const b = buildLeaguePostseason(games).brackets[0];
    expect(b.rounds.map(r => r.series.length)).toEqual([1, 2, 1]);
    expect(b.champion!.id).toBe(3);
  });

  it('shows runs rather than wins for one-game "series"', () => {
    const v = buildLeaguePostseason([game('AFL Championship Game', 'W', 1, 7, 8, [3, 5])]);
    const s = v.brackets[0].rounds[0].series[0];
    expect(s.scoreKind).toBe('runs');
    expect(s.score).toEqual([5, 3]);           // game 1's host first
    expect(s.teams[0].id).toBe(8);
    expect(s.winner).toBe(0);
    expect(v.brackets[0].champion!.id).toBe(8);
  });

  it('a round robin becomes a table, then the final is a bracket', () => {
    const games = [
      game('LIDOM Round Robin', 'L', 1, 1, 2, [1, 4], { date: '2025-12-27' }),   // 2 beats 1
      game('LIDOM Round Robin', 'L', 1, 3, 1, [2, 3], { date: '2025-12-28' }),   // 1 beats 3
      game('LIDOM Round Robin', 'L', 2, 3, 2, [5, 0], { date: '2025-12-29' }),   // 3 beats 2
      game('LIDOM Round Robin', 'L', 1, 2, 3, null, { date: '2026-01-19' }),     // still to play
      ...series('LIDOM Championship', 'W', 7, 2, 1, 4, 1, '2026-01-21')
    ];
    const v = buildLeaguePostseason(games);
    expect(v.robins.length).toBe(1);
    const r = v.robins[0];
    expect(r.name).toBe('LIDOM Round Robin');
    expect(r.pool).toBeNull();
    expect(r.games).toBe(4);
    expect(r.finished).toBe(3);
    expect(r.rows.map(x => `${x.team.id}:${x.wins}-${x.losses}`)).toEqual(['1:1-1', '2:1-1', '3:1-1']);
    expect(v.brackets[0].rounds.map(x => x.name)).toEqual(['LIDOM Championship']);
    expect(v.brackets[0].champion!.id).toBe(2);
    expect(v.pending).toBeTrue();                  // one round-robin game left
  });

  it('splits pool play into pools (WBC style) ahead of the knockout rounds', () => {
    const poolGames = (teams: number[], date: string) => {
      const out: any[] = [];
      for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) out.push(game('World Baseball Classic Pool Play', 'F', 10, teams[i], teams[j], [1, 2], { date }));
      return out;
    };
    const games = [
      ...poolGames([1, 2, 3, 4], '2023-03-08'),
      ...poolGames([5, 6, 7, 8], '2023-03-09'),
      game('World Baseball Classic Quarterfinals', 'D', 4, 1, 5, [3, 4], { date: '2023-03-15' }),
      game('World Baseball Classic Quarterfinals', 'D', 4, 2, 6, [3, 4], { date: '2023-03-15' }),
      game('World Baseball Classic Semifinals', 'L', 2, 5, 6, [1, 0], { date: '2023-03-19' }),
      game('World Baseball Classic Finals', 'W', 1, 5, 9, [2, 1], { date: '2023-03-21' })
    ];
    const v = buildLeaguePostseason(games);
    expect(v.robins.map(r => r.pool)).toEqual(['Pool A', 'Pool B']);
    expect(v.robins.every(r => r.games === 6)).toBeTrue();
    expect(v.brackets.length).toBe(1);
    // "gamesInSeries: 4" on four one-game quarterfinals is the round's size, not a best-of-4
    const qf = v.brackets[0].rounds[0].series;
    expect(qf.every(s => s.bestOf === 1 && s.winner !== null && s.scoreKind === 'runs')).toBeTrue();
    expect(v.brackets[0].rounds.map(r => r.name)).toEqual([
      'World Baseball Classic Quarterfinals', 'World Baseball Classic Semifinals', 'World Baseball Classic Finals'
    ]);
  });

  it('gives each league its own bracket, titled by its championship', () => {
    const games = [
      ...series('SAL Division Series', 'L', 3, 1, 2, 2, 1, '2025-09-09'),
      ...series('SAL Championship Series', 'W', 3, 1, 3, 2, 0, '2025-09-14'),
      ...series('MWL Division Series', 'L', 3, 11, 12, 1, 2, '2025-09-09'),
      ...series('MWL Championship Series', 'W', 3, 12, 13, 2, 1, '2025-09-14'),
      ...series('NWL Championship Series', 'W', 5, 21, 22, 3, 1, '2025-09-09')
    ];
    const v = buildLeaguePostseason(games);
    expect(v.brackets.map(b => b.title)).toEqual(['MWL Championship Series', 'NWL Championship Series', 'SAL Championship Series']);
    expect(v.brackets.map(b => b.rounds.length)).toEqual([2, 1, 2]);
    expect(v.brackets.map(b => b.champion!.id)).toEqual([12, 21, 1]);
  });

  it('counts a series by clinch: best of 9 needs 5 wins; unfinished series are live', () => {
    const done = buildLeaguePostseason(series('LBPRC Finals', 'W', 9, 1, 2, 5, 1, '2026-01-12')).brackets[0].rounds[0].series[0];
    expect(done.winner).toBe(0);
    expect(done.score).toEqual([5, 1]);
    const open = buildLeaguePostseason([...series('Finals', 'W', 7, 1, 2, 2, 1, '2026-01-12'), game('Finals', 'W', 7, 1, 2, null, { date: '2026-01-20' })]);
    const s = open.brackets[0].rounds[0].series[0];
    expect(s.winner).toBeNull();
    expect(s.status).toBe('live');
    expect(open.brackets[0].champion).toBeNull();
    expect(open.pending).toBeTrue();
  });

  it('a live game marks the series live; no results yet means upcoming', () => {
    const live = buildLeaguePostseason([game('Semifinals', 'L', 7, 1, 2, [1, 0], { state: 'Live' })]);
    expect(live.brackets[0].rounds[0].series[0].status).toBe('live');
    const up = buildLeaguePostseason([game('Semifinals', 'L', 7, 1, 2, null)]);
    expect(up.brackets[0].rounds[0].series[0].status).toBe('upcoming');
    expect(up.pending).toBeTrue();
  });

  it('a split two-game round has no winner but is finished', () => {
    const v = buildLeaguePostseason([
      game('LVBP First Round', 'D', 2, 1, 2, [1, 0], { date: '2025-12-29' }),
      game('LVBP First Round', 'D', 2, 1, 2, [0, 1], { date: '2025-12-30' })
    ]);
    const s = v.brackets[0].rounds[0].series[0];
    expect(s.winner).toBeNull();
    expect(s.status).toBe('final');
    expect(s.score).toEqual([1, 1]);
  });

  it('drops postponed games and a repeated gamePk, keeping the finished copy', () => {
    const v = buildLeaguePostseason([
      game('Finals', 'W', 3, 1, 2, null, { pk: 77, detailed: 'Postponed', state: 'Preview' }),
      game('Finals', 'W', 3, 1, 2, null, { pk: 78 }),
      game('Finals', 'W', 3, 1, 2, [4, 2], { pk: 78 }),
      game('Finals', 'W', 3, 1, 2, [4, 2], { pk: 79 })
    ]);
    expect(v.games).toBe(2);
    expect(v.brackets[0].rounds[0].series[0].score).toEqual([0, 2]);
  });

  it('names rounds from the game type when the feed gives no description', () => {
    const v = buildLeaguePostseason([game(undefined, 'D', 3, 1, 2, [1, 2]), game(undefined, 'W', 3, 2, 3, [1, 2], { date: '2025-12-30' })]);
    expect(v.brackets[0].rounds.map(r => r.name)).toEqual(['Division Series', 'Finals']);
  });
});
