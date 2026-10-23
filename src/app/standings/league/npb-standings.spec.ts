import { buildLgStandings } from './league-standings-model';
import { buildNpbBundle } from './league-standings.service';
import { buildNpbRecords, countsForStandings, latestResultDate } from './npb-standings';

let n = 0;
const T = (id: number, division: string) => ({ id, name: `Team ${id}`, abbrev: `T${id}`, league: 'NPB', division });
const CL = (id: number) => T(id, 'Central League');
const PL = (id: number) => T(id, 'Pacific League');
function g(away: any, home: any, a: number | null, h: number | null, over: any = {}) {
  return {
    gamePk: String(++n), gameDate: '2026-05-01T18:00:00+09:00', officialDate: '2026-05-01',
    status: { detailedState: a == null ? 'Scheduled' : 'Final' },
    teams: { away: { team: away, score: a }, home: { team: home, score: h } },
    ...over
  } as any;
}

describe('buildNpbRecords', () => {
  it('counts wins, losses and ties per team, one table per league', () => {
    const recs = buildNpbRecords([
      g(CL(1), CL(2), 5, 3),     // 1 beats 2
      g(CL(2), CL(1), 4, 4),     // tie
      g(PL(11), PL(12), 0, 1),   // 12 beats 11
      g(CL(1), PL(11), 2, 1)     // interleague: 1 beats 11
    ]);
    expect(recs.map(r => r.league.name)).toEqual(['Central League', 'Pacific League']);
    const by = (id: number) => recs.flatMap(r => r.teamRecords).find((t: any) => t.team.id === id);
    expect([by(1).wins, by(1).losses, by(1).ties]).toEqual([2, 0, 1]);
    expect([by(2).wins, by(2).losses, by(2).ties]).toEqual([0, 1, 1]);
    expect([by(11).wins, by(11).losses, by(11).ties]).toEqual([0, 2, 0]);
    expect([by(12).wins, by(12).losses, by(12).ties]).toEqual([1, 0, 0]);
  });

  it('ignores postponed, unplayed and score-less games but still lists their teams at 0-0', () => {
    const recs = buildNpbRecords([
      g(CL(1), CL(2), 1, 0),
      g(CL(3), CL(4), null, null, { status: { detailedState: 'Postponed' }, isCancelled: true }),
      g(CL(3), CL(4), null, null)
    ]);
    const ids = recs[0].teamRecords.map((t: any) => t.team.id).sort();
    expect(ids).toEqual([1, 2, 3, 4]);
    expect(recs[0].teamRecords.find((t: any) => t.team.id === 3)).toEqual(jasmine.objectContaining({ wins: 0, losses: 0, ties: 0 }));
  });

  it('is empty until a game has been played', () => {
    expect(buildNpbRecords([])).toEqual([]);
    expect(buildNpbRecords([g(CL(1), CL(2), null, null)])).toEqual([]);
  });

  it('countsForStandings needs a Final status, both scores, and not cancelled', () => {
    expect(countsForStandings(g(CL(1), CL(2), 0, 0))).toBeTrue();     // 0-0 score is a real (tied) result
    expect(countsForStandings(g(CL(1), CL(2), 1, null, { status: { detailedState: 'Final' } }))).toBeFalse();
    expect(countsForStandings(g(CL(1), CL(2), 1, 0, { isCancelled: true }))).toBeFalse();
    expect(countsForStandings(g(CL(1), CL(2), 1, 0, { status: { detailedState: 'Scheduled' } }))).toBeFalse();
  });
});

describe('NPB tables', () => {
  it('rank by win % with ties left out of the percentage, and GB from wins and losses', () => {
    const games: any[] = [];
    const rep = (k: number, x: any, y: any, a: number, h: number) => { for (let i = 0; i < k; i++) games.push(g(x, y, a, h)); };
    // A = team 1, B = team 2, C = team 3 (all Central League)
    rep(6, CL(1), CL(3), 2, 1);   // A beats C six times
    rep(5, CL(3), CL(1), 3, 2);   // C beats A five times            → A 6-5
    rep(5, CL(2), CL(3), 1, 0);   // B beats C five times
    rep(3, CL(3), CL(2), 4, 0);   // C beats B three times
    rep(2, CL(2), CL(3), 1, 1);   // two ties                         → B 5-3-2, C 8-11-2
    const view = buildLgStandings(buildNpbRecords(games));
    const t = view.blocks[0].table;

    expect(t.map(r => r.teamId)).toEqual([2, 1, 3]);   // B leads on .625 despite having fewer wins than A
    expect([t[0].wins, t[0].losses, t[0].ties, t[0].pct, t[0].gb]).toEqual([5, 3, 2, '.625', '—']);
    expect([t[1].wins, t[1].losses, t[1].ties, t[1].pct, t[1].gb]).toEqual([6, 5, 0, '.545', '0.5']);
    expect([t[2].wins, t[2].losses, t[2].ties, t[2].pct, t[2].gb]).toEqual([8, 11, 2, '.421', '2.5']);
    expect(view.showTies).toBeTrue();
    expect(view.hasDivisions).toBeFalse();
    expect(view.blocks.length).toBe(1);
  });

  it('draws the official 2026 W-L-T records in the right order with the official games-behind', () => {
    const rec = (id: number, name: string, w: number, l: number, t: number) => ({ team: { id, name, abbreviation: name.slice(0, 3) }, wins: w, losses: l, ties: t });
    const view = buildLgStandings([
      { league: { id: 3102, name: 'Pacific League' }, teamRecords: [
        rec(3012, 'Rakuten', 58, 84, 1), rec(3007, 'SoftBank', 91, 49, 3), rec(3011, 'Lotte', 63, 77, 3),
        rec(3008, 'Seibu', 79, 60, 4), rec(3010, 'ORIX', 65, 76, 2), rec(3009, 'Nippon-Ham', 78, 62, 3)] },
      { league: { id: 3101, name: 'Central League' }, teamRecords: [
        rec(3005, 'Chunichi', 60, 81, 2), rec(3002, 'Hanshin', 79, 62, 2), rec(3004, 'Hiroshima', 61, 78, 4),
        rec(3001, 'Yomiuri', 76, 64, 3), rec(3003, 'DeNA', 71, 69, 3), rec(3006, 'Yakult', 61, 80, 2)] }
    ]);
    expect(view.blocks.map(b => b.name)).toEqual(['Central League', 'Pacific League']);
    const cl = view.blocks[0].table.map(r => `${r.teamName} ${r.wins}-${r.losses}-${r.ties} ${r.pct} ${r.gb}`);
    expect(cl).toEqual([
      'Hanshin 79-62-2 .560 —', 'Yomiuri 76-64-3 .543 2.5', 'DeNA 71-69-3 .507 7.5',
      'Hiroshima 61-78-4 .439 17.0', 'Yakult 61-80-2 .433 18.0', 'Chunichi 60-81-2 .426 19.0'
    ]);
    const pl = view.blocks[1].table.map(r => `${r.teamName} ${r.wins}-${r.losses}-${r.ties} ${r.pct} ${r.gb}`);
    expect(pl).toEqual([
      'SoftBank 91-49-3 .650 —', 'Seibu 79-60-4 .568 11.5', 'Nippon-Ham 78-62-3 .557 13.0',
      'ORIX 65-76-2 .461 26.5', 'Lotte 63-77-3 .450 28.0', 'Rakuten 58-84-1 .408 34.0'
    ]);
  });
});

describe('buildNpbBundle', () => {
  it('has the latest finished game date and no postseason or halves', () => {
    const b = buildNpbBundle(2026, [
      g(CL(1), CL(2), 1, 0, { officialDate: '2026-05-01' }),
      g(CL(1), CL(2), 0, 3, { officialDate: '2026-09-30' }),
      g(CL(1), CL(2), null, null, { officialDate: '2026-10-20' })
    ]);
    expect(b.through).toBe('2026-09-30');
    expect(b.periods).toEqual(['full']);
    expect(b.postseason!.games).toBe(0);
    expect(latestResultDate([])).toBeNull();
  });
});
