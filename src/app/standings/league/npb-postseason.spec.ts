import { NPB_POSTSEASON, NPB_TEAMS, npbPostseason, npbPostseasonFromData, npbPostseasonProjection } from './npb-postseason';
import { buildLgStandings } from './league-standings-model';
import { describePostseason } from './league-format';

const clubById = (id: number) => Object.values(NPB_TEAMS).find(t => t.id === id)!;

/** Standings view for the two leagues: six clubs each, best record first (ids 3001–3012 as in the data set). */
function standingsView() {
  const rec = (league: string, ids: number[], top: number) => ({
    league: { id: league === 'CL' ? 1 : 2, name: league === 'CL' ? 'Central League' : 'Pacific League' },
    teamRecords: ids.map((id, i) => ({
      team: { id, name: clubById(id).name, abbreviation: clubById(id).abbr },
      wins: top - i * 5, losses: 70 + i * 5
    }))
  });
  return buildLgStandings([rec('CL', [3002, 3001, 3003, 3004, 3005, 3006], 80), rec('PL', [3007, 3012, 3008, 3011, 3009, 3010], 90)]);
}

describe('NPB 2026 postseason (bundled results)', () => {
  const r = npbPostseasonFromData(2026)!;

  it('exists for 2026 only, with the date it was entered', () => {
    expect(r.source).toEqual({ kind: 'bundled', updated: '2026-10-22' });
    expect(npbPostseasonFromData(2025)).toBeNull();
    expect(NPB_POSTSEASON.map(e => e.season)).toEqual([2026]);
  });

  it('every club abbreviation in the data is a known club, and each id is distinct', () => {
    for (const e of NPB_POSTSEASON) for (const s of e.series) s.teams.forEach(a => expect(NPB_TEAMS[a]).withContext(a).toBeDefined());
    expect(new Set(Object.values(NPB_TEAMS).map(t => t.id)).size).toBe(12);
  });

  it('is three boards: the two leagues\' Climax Series, then the Japan Series', () => {
    expect(r.view.brackets.map(b => b.title)).toEqual(['Central League Climax Series', 'Pacific League Climax Series', 'Japan Series']);
    expect(r.view.brackets[0].rounds.map(x => x.name)).toEqual(['First Stage', 'Final Stage']);
    expect(r.view.brackets[2].rounds.map(x => x.name)).toEqual(['Japan Series']);
  });

  it('Central League: DeNA beat the Giants 2–0, then Hanshin (1-win head start) 4–1', () => {
    const [first, fin] = r.view.brackets[0].rounds.map(x => x.series[0]);
    expect(first.teams.map(t => t.abbr)).toEqual(['YOM', 'DENA']);
    expect(first.score).toEqual([0, 2]);
    expect(first.winner).toBe(1);
    expect(first.status).toBe('final');
    expect(fin.teams.map(t => t.abbr)).toEqual(['HAN', 'DENA']);
    expect(fin.score).toEqual([1, 4]);
    expect(fin.headStart).toEqual([1, 0]);
    expect(fin.winner).toBe(1);
    expect(r.view.brackets[0].champion!.abbr).toBe('DENA');
  });

  it('Pacific League: Fighters beat the Lions 2–1, then lost to SoftBank 0–3 plus a 2-win head start (best of 9)', () => {
    const [first, fin] = r.view.brackets[1].rounds.map(x => x.series[0]);
    expect(first.score).toEqual([1, 2]);
    expect(first.winner).toBe(1);
    expect(fin.bestOf).toBe(9);
    expect(fin.score).toEqual([5, 0]);
    expect(fin.headStart).toEqual([2, 0]);
    expect(fin.winner).toBe(0);
    expect(r.view.brackets[1].champion!.abbr).toBe('SBH');
  });

  it('Japan Series: DeNA host SoftBank, best of 7, not started — so no champion yet', () => {
    const js = r.view.brackets[2].rounds[0].series[0];
    expect(js.teams.map(t => t.abbr)).toEqual(['DENA', 'SBH']);
    expect(js.bestOf).toBe(7);
    expect(js.status).toBe('upcoming');
    expect(js.winner).toBeNull();
    expect(r.view.champions).toEqual([]);
    expect(r.view.pending).toBeTrue();
    expect(r.view.teams.map(t => t.abbr).sort()).toEqual(['DENA', 'HAN', 'NHF', 'SBH', 'SEI', 'YOM']);
  });

  it('a Japan Series that is under way is live, and a decided one names its champion', () => {
    const js = NPB_POSTSEASON[0].series.find(s => s.stage === 'japan')!;
    const original = js.wins;
    try {
      js.wins = [1, 1];
      expect(npbPostseasonFromData(2026)!.view.brackets[2].rounds[0].series[0].status).toBe('live');
      js.wins = [2, 4];
      const done = npbPostseasonFromData(2026)!;
      expect(done.view.brackets[2].rounds[0].series[0].status).toBe('final');
      expect(done.view.brackets[2].champion!.abbr).toBe('SBH');
      expect(done.view.champions.map(t => t.abbr)).toEqual(['SBH']);
      expect(done.view.pending).toBeFalse();
    } finally { js.wins = original; }
  });

  it('reads as a postseason outline', () => {
    const lines = describePostseason(r.view);
    expect(lines[0]).toBe('6 teams played in the postseason.');
    expect(lines).toContain('Japan Series (best of 7)');
  });
});

describe('NPB projected postseason', () => {
  it('is the top three of each league: 2nd vs 3rd, 1st waits, Japan Series TBD', () => {
    const p = npbPostseasonProjection(standingsView())!;
    expect(p.source).toEqual({ kind: 'projected' });
    const [cl, pl, js] = p.view.brackets;
    expect(cl.rounds[0].series[0].teams.map(t => t.abbr)).toEqual(['YOM', 'DENA']);
    expect(cl.rounds[1].series[0].teams.map(t => t.abbr)).toEqual(['HAN', 'TBD']);
    expect(pl.rounds[0].series[0].teams.map(t => t.abbr)).toEqual(['SEI', 'NHF']);
    expect(pl.rounds[1].series[0].teams.map(t => t.abbr)).toEqual(['SBH', 'TBD']);
    expect(js.rounds[0].series[0].teams.map(t => t.name)).toEqual(['Central League winner', 'Pacific League winner']);
    expect(p.view.brackets.flatMap(b => b.rounds.flatMap(x => x.series)).every(s => s.status === 'upcoming' && s.winner === null)).toBeTrue();
    expect(p.view.champions).toEqual([]);
    expect(p.view.teams.length).toBe(6);
    // series keys are unique even though both Final Stage opponents are placeholders
    const keys = p.view.brackets.flatMap(b => b.rounds.flatMap(x => x.series.map(s => s.key)));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('needs three clubs in each league with games played', () => {
    expect(npbPostseasonProjection(null)).toBeNull();
    expect(npbPostseasonProjection(buildLgStandings([]))).toBeNull();
    const one = buildLgStandings([{ league: { id: 1, name: 'Central League' }, teamRecords: [{ team: { id: 3001, name: 'Yomiuri Giants' }, wins: 1, losses: 0 }] }]);
    expect(npbPostseasonProjection(one)).toBeNull();
  });

  it('is used only for the season in progress and only when nothing was entered', () => {
    const v = standingsView();
    expect(npbPostseason(2027, v, true)!.source.kind).toBe('projected');
    expect(npbPostseason(2025, v, false)).toBeNull();                  // a finished season with no results: no board
    expect(npbPostseason(2026, v, true)!.source.kind).toBe('bundled');  // entered results win over a projection
  });
});
