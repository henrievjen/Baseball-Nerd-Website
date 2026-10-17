import { formatForSeason } from './postseason-formats';
import {
  BNode, BracketModel, BTeam, TeamLookup, buildBracket, collectNodes, isPlaceholderTeam, makeTeamResolver
} from './bracket-model';
import { BracketLayout, PITCH, layoutBracket } from './bracket-layout';
import { infoFor, postseasonFixture, teamName } from './testing/postseason-fixtures';

const ABBR: Record<number, string> = {
  145: 'CHW', 158: 'MIL', 139: 'TB', 144: 'ATL', 147: 'NYY', 119: 'LAD', 141: 'TOR', 136: 'SEA', 143: 'PHI',
  112: 'CHC', 135: 'SD', 114: 'CLE', 117: 'HOU', 116: 'DET', 111: 'BOS', 113: 'CIN', 110: 'BAL', 140: 'TEX', 133: 'ATH'
};

/** Today's team data (names are today's — historical names must NOT get today's logo). */
const lookup: TeamLookup = {
  color: () => '#123456',
  abbr: id => ABBR[id] ?? `T${id}`,
  logo: id => `https://logos.test/${id}.svg`,
  name: id => teamName(0, id)
};
const resolve = makeTeamResolver(lookup);

function build(year: number, opts: { fixture?: number; projected?: boolean } = {}): BracketModel {
  const seeds = (ids: number[]): BTeam[] => ids.map(id => resolve(id, teamName(0, id)));
  return buildBracket({
    season: year,
    series: postseasonFixture(opts.fixture ?? year),
    info: infoFor(year),
    resolve,
    projected: opts.projected
      ? { AL: seeds([139, 114, 117, 147, 111, 145]), NL: seeds([158, 119, 144, 135, 112, 143]) }
      : null
  });
}

const abbrs = (n: BNode) => n.slots.map(s => s.team?.abbr ?? `[${s.label}]`);
const seeds = (n: BNode) => n.slots.map(s => s.seed);

describe('formatForSeason', () => {
  it('maps every era', () => {
    const kind = (y: number) => formatForSeason(y).kind;
    expect([1901, 1902, 1904, 1994].map(kind)).toEqual(['none', 'none', 'none', 'none']);
    expect([1903, 1955, 1968].map(kind)).toEqual(['ws', 'ws', 'ws']);
    expect([1969, 1985, 1993].map(kind)).toEqual(['lcs', 'lcs', 'lcs']);
    expect([1981, 1995, 2011].map(kind)).toEqual(['ds', 'ds', 'ds']);
    expect([2012, 2019, 2021].map(kind)).toEqual(['wcgame', 'wcgame', 'wcgame']);
    expect(kind(2020)).toBe('wc8');
    expect([2022, 2025, 2026, 2030].map(kind)).toEqual(['wc6', 'wc6', 'wc6', 'wc6']);
  });

  it('says byes for the top two seeds started in 2022', () => {
    expect(formatForSeason(2022).note).toContain('top two division winners');
    expect(formatForSeason(2022).headline).toContain('top two');
  });

  it('flags the best-of-nine World Series years', () => {
    expect(formatForSeason(1903).note).toContain('best-of-nine');
    expect(formatForSeason(1920).note).toContain('best-of-nine');
    expect(formatForSeason(1955).note).not.toContain('best-of-nine');
  });
});

describe('team resolver', () => {
  it('uses the current logo and abbreviation when the name matches', () => {
    const t = resolve(147, 'New York Yankees');
    expect(t.logo).toBe('https://logos.test/147.svg');
    expect(t.abbr).toBe('NYY');
    expect(t.clickable).toBeTrue();
  });

  it('shows an initials tile (no logo) for a club that played under another name', () => {
    const t = resolve(119, 'Brooklyn Dodgers');
    expect(t.logo).toBeNull();
    expect(t.abbr).toBe('BKN');
    expect(resolve(114, 'Cleveland Indians').logo).toBeNull();
    expect(resolve(120, 'Montreal Expos').abbr).toBe('MON');
  });

  it('keeps the Athletics logo through the Oakland years', () => {
    expect(resolve(133, 'Oakland Athletics').logo).not.toBeNull();
    expect(resolve(133, 'Athletics').logo).not.toBeNull();
    expect(resolve(133, 'Philadelphia Athletics').logo).toBeNull();
  });

  it('recognises placeholder teams from the feed', () => {
    expect(isPlaceholderTeam(21, 'AL Champion')).toBeTrue();
    expect(isPlaceholderTeam(31, 'NL Champion')).toBeTrue();
    expect(isPlaceholderTeam(0, '')).toBeTrue();
    expect(isPlaceholderTeam(147, 'New York Yankees')).toBeFalse();
  });
});

describe('buildBracket — 12 teams, byes for seeds 1 and 2 (2025)', () => {
  const m = build(2025);
  const al = m.roots.AL!, nl = m.roots.NL!, ws = m.roots.WS!;

  it('is the 12-team format with Wild Card / DS / LCS columns', () => {
    expect(m.kind).toBe('wc6');
    expect(m.projected).toBeFalse();
    expect(m.columns.AL.map(c => c.title)).toEqual(['WILD CARD', 'ALDS', 'ALCS']);
    expect(m.columns.NL.map(c => c.title)).toEqual(['WILD CARD', 'NLDS', 'NLCS']);
    expect(m.columns.AL.map(c => c.bestOf)).toEqual([3, 5, 7]);
    expect(collectNodes(ws).length).toBe(11);
  });

  it('puts the No. 2 seed\'s half on top, the No. 1 seed\'s below (as in MLB\'s graphic)', () => {
    const [top, bottom] = al.feeders;
    expect(abbrs(top!)).toEqual(['DET', 'SEA']);     // Wild Card winner, then the bye team
    expect(abbrs(bottom!)).toEqual(['NYY', 'TOR']);
    expect(seeds(top!)).toEqual(['', '2']);
    expect(seeds(bottom!)).toEqual(['', '1']);
  });

  it('seeds the Wild Card Series 6/3 and 5/4 with the road team on top', () => {
    const [f36, f45] = [al.feeders[0]!.feeders[0]!, al.feeders[1]!.feeders[0]!];
    expect(abbrs(f36)).toEqual(['DET', 'CLE']);
    expect(seeds(f36)).toEqual(['6', '3']);
    expect(abbrs(f45)).toEqual(['BOS', 'NYY']);
    expect(seeds(f45)).toEqual(['5', '4']);
    expect(f36.bestOf).toBe(3);
  });

  it('wires the National League the same way', () => {
    expect(abbrs(nl.feeders[0]!)).toEqual(['LAD', 'PHI']);   // winner of 3/6, No. 2 seed
    expect(abbrs(nl.feeders[1]!)).toEqual(['CHC', 'MIL']);   // winner of 4/5, No. 1 seed
    expect(seeds(nl.feeders[1]!)).toEqual(['', '1']);
  });

  it('records winners, losers and status text', () => {
    expect(al.statusText).toBe('TOR wins 4-3');
    expect(al.winner).toBe(1);                                // Toronto is the bottom slot
    expect(al.slots[0].state).toBe('lost');
    expect(al.slots[1].state).toBe('won');
    expect(nl.statusText).toBe('LAD wins 4-0');
    const f = al.feeders[0]!.feeders[0]!;
    expect(f.statusText).toBe('DET wins 2-1');
    expect(f.slots[1].state).toBe('lost');
  });

  it('puts the AL champion on the left of the World Series and crowns the winner', () => {
    expect(abbrs(ws)).toEqual(['TOR', 'LAD']);
    expect(ws.statusText).toBe('LAD wins 4-3');
    expect(ws.bestOf).toBe(7);
    expect(ws.winner).toBe(1);
  });
});

describe('buildBracket — 2022, the first 12-team year', () => {
  const m = build(2022);
  it('already gave seeds 1 AND 2 a bye', () => {
    expect(m.kind).toBe('wc6');
    const al = m.roots.AL!;
    expect(abbrs(al.feeders[0]!)).toEqual(['CLE', 'NYY']);   // Yankees: No. 2 seed, bye
    expect(abbrs(al.feeders[1]!)).toEqual(['SEA', 'HOU']);   // Astros: No. 1 seed, bye
    expect(seeds(al.feeders[0]!)[1]).toBe('2');
    expect(seeds(al.feeders[1]!)[1]).toBe('1');
    expect(abbrs(m.roots.WS!)).toEqual(['HOU', 'PHI']);
  });
});

describe('buildBracket — 2026, in progress', () => {
  const m = build(2026, { projected: true });
  const al = m.roots.AL!, nl = m.roots.NL!, ws = m.roots.WS!;

  it('shows each series\' real status', () => {
    expect(al.statusText).toBe('Series tied 1-1');
    expect(nl.statusText).toBe('MIL leads 3-0');
    expect(al.feeders[0]!.feeders[0]!.statusText).toBe('CHW wins 2-0');
    expect(nl.feeders[0]!.feeders[0]!.statusText).toBe('ATL wins 2-1');
    expect(al.feeders[1]!.feeders[0]!.statusText).toBe('NYY wins 2-0');
    expect(nl.feeders[1]!.feeders[0]!.statusText).toBe('SD wins 2-0');
  });

  it('matches the reference graphic\'s teams and seeds', () => {
    expect(abbrs(al.feeders[0]!.feeders[0]!)).toEqual(['CHW', 'HOU']);
    expect(seeds(al.feeders[0]!.feeders[0]!)).toEqual(['6', '3']);
    expect(abbrs(al.feeders[0]!)).toEqual(['CHW', 'CLE']);
    expect(abbrs(al.feeders[1]!)).toEqual(['NYY', 'TB']);
    expect(abbrs(nl.feeders[0]!)).toEqual(['ATL', 'LAD']);
    expect(abbrs(nl.feeders[1]!)).toEqual(['SD', 'MIL']);
    expect(abbrs(al)).toEqual(['CLE', 'TB']);
    expect(abbrs(nl)).toEqual(['LAD', 'MIL']);
  });

  it('leaves the World Series undecided', () => {
    expect(ws.state).toBe('tbd');
    expect(ws.winner).toBeNull();
    expect(abbrs(ws)).toEqual(['[AL Champion]', '[NL Champion]']);
    expect(ws.statusText).toBe('');
  });
});

describe('buildBracket — 2026 right after the Wild Card round (later series not created yet)', () => {
  const m = build(2026, { fixture: 20260, projected: true });
  const al = m.roots.AL!, nl = m.roots.NL!;

  it('keeps the full bracket, with TBD boxes and the byes filled from the standings', () => {
    expect(m.kind).toBe('wc6');
    expect(collectNodes(m.roots.WS).length).toBe(11);
    // AL Division Series: Wild Card winner + No. 2 seed (Guardians) / No. 4-5 winner + No. 1 seed (Rays)
    expect(abbrs(al.feeders[0]!)).toEqual(['CHW', 'CLE']);
    expect(abbrs(al.feeders[1]!)).toEqual(['NYY', 'TB']);
    expect(seeds(al.feeders[1]!)).toEqual(['', '1']);
    expect(al.slots.every(s => !s.team)).toBeTrue();
  });

  it('shows an unfinished Wild Card series as live and its DS slot as TBD', () => {
    const f45 = nl.feeders[1]!.feeders[0]!;
    expect(f45.statusText).toBe('Series tied 1-1');
    expect(nl.feeders[1]!.slots[0].team).toBeNull();
    expect(nl.feeders[1]!.slots[0].label).toBe('Winner 4/5');
    expect(nl.feeders[0]!.slots[0].team?.abbr).toBe('ATL');
  });
});

describe('buildBracket — before any series exist', () => {
  it('projects the 12-team bracket from the standings for the current format', () => {
    const m = buildBracket({ season: 2026, series: [], info: new Map(), resolve,
      projected: { AL: [139, 114, 117, 147, 111, 145].map(id => resolve(id, teamName(0, id))), NL: [158, 119, 144, 135, 112, 143].map(id => resolve(id, teamName(0, id))) } });
    expect(m.projected).toBeTrue();
    expect(m.kind).toBe('wc6');
    const al = m.roots.AL!;
    expect(abbrs(al.feeders[0]!.feeders[0]!)).toEqual(['CHW', 'HOU']);   // 6 v 3
    expect(abbrs(al.feeders[1]!.feeders[0]!)).toEqual(['BOS', 'NYY']);   // 5 v 4
    expect(abbrs(al.feeders[0]!)).toEqual(['[Winner 3/6]', 'CLE']);
    expect(abbrs(al.feeders[1]!)).toEqual(['[Winner 4/5]', 'TB']);
    expect(abbrs(m.roots.WS!)).toEqual(['[AL Champion]', '[NL Champion]']);
  });

  it('shows no bracket for years without a postseason', () => {
    for (const y of [1901, 1904, 1994]) {
      const m = buildBracket({ season: y, series: [], info: new Map(), resolve });
      expect(m.kind).toBe('none');
      expect(m.roots.WS).toBeNull();
      expect(layoutBracket(m)).toBeNull();
    }
    expect(buildBracket({ season: 1994, series: [], info: new Map(), resolve }).format.note).toContain('strike');
  });

  it('says so plainly when a modern year has no data and nothing to project from', () => {
    const m = buildBracket({ season: 2019, series: [], info: new Map(), resolve });
    expect(m.kind).toBe('none');
    expect(m.format.headline).toBe('Postseason not available');
  });
});

describe('buildBracket — 2020, 16 teams', () => {
  const m = build(2020);
  const al = m.roots.AL!;

  it('is the 8-team-per-league Wild Card Series with no byes', () => {
    expect(m.kind).toBe('wc8');
    expect(collectNodes(m.roots.WS).length).toBe(15);
    expect(m.columns.AL.map(c => c.bestOf)).toEqual([3, 5, 7]);
  });

  it('meets 1v8 with 4v5 and 3v6 with 2v7', () => {
    const [top, bottom] = al.feeders;
    expect(top!.feeders.map(f => seeds(f!).join('/'))).toEqual(['8/1', '5/4']);
    expect(bottom!.feeders.map(f => seeds(f!).join('/'))).toEqual(['6/3', '7/2']);
    expect(abbrs(top!)).toEqual(['TB', 'NYY']);     // Rays (1v8 winner) over Yankees (4v5 winner)
    expect(abbrs(bottom!)).toEqual(['HOU', 'ATH']);
  });

  it('uses initials for the then-Indians but keeps the Athletics logo', () => {
    const f45 = al.feeders[0]!.feeders[1]!;
    expect(f45.slots[1].team?.name).toBe('Cleveland Indians');
    expect(f45.slots[1].team?.logo).toBeNull();
    expect(f45.slots[1].team?.abbr).toBe('CLE');
    const f27 = al.feeders[1]!.feeders[1]!;
    expect(f27.slots[1].team?.name).toBe('Oakland Athletics');
    expect(f27.slots[1].team?.logo).not.toBeNull();
  });
});

describe('buildBracket — 2012, one-game Wild Card', () => {
  const m = build(2012);
  const al = m.roots.AL!;

  it('has a single Wild Card Game column', () => {
    expect(m.kind).toBe('wcgame');
    expect(m.columns.AL.map(c => c.title)).toEqual(['WILD CARD GAME', 'ALDS', 'ALCS']);
    expect(m.columns.AL[0].bestOf).toBe(1);
    const game = al.feeders[1]!.feeders[0]!;
    expect(game.bestOf).toBe(1);
    expect(game.statusText).toBe('BAL wins 5-2');
    expect(seeds(game)).toEqual(['5', '4']);
  });

  it('puts the series with the Wild Card winner below the 2-v-3 series', () => {
    expect(abbrs(al.feeders[0]!)).toEqual(['ATH', 'DET']);
    expect(abbrs(al.feeders[1]!)).toEqual(['BAL', 'NYY']);
  });

  it('seeds the division winners 1-3 by record', () => {
    expect(seeds(al.feeders[1]!)).toEqual(['', '1']);          // Yankees
    expect(seeds(al.feeders[0]!).sort()).toEqual(['2', '3']);  // Athletics, Tigers
  });
});

describe('buildBracket — 1995, Division Series era', () => {
  const m = build(1995);
  it('has DS + LCS columns with Wild Card tags', () => {
    expect(m.kind).toBe('ds');
    expect(m.columns.AL.map(c => c.title)).toEqual(['ALDS', 'ALCS']);
    const d2 = m.roots.AL!.feeders[1]!;
    expect(d2.slots.map(s => `${s.team?.abbr}:${s.seed}`).sort()).toEqual(['NYY:WC', 'SEA:']);
    const d3 = m.roots.NL!.feeders[0]!;
    expect(d3.slots.map(s => `${s.team?.name}:${s.seed}`).sort()).toEqual(['Atlanta Braves:', 'Colorado Rockies:WC']);
  });

  it('lines the LCS up with the series each team came from', () => {
    const al = m.roots.AL!;
    expect(abbrs(al.feeders[0]!)).toEqual(['BOS', 'CLE']);
    expect(abbrs(al)).toEqual(['CLE', 'SEA']);
    expect(al.slots[0].state).toBe('won');
  });
});

describe('buildBracket — 1981 split season', () => {
  it('has Division Series but no Wild Card tags', () => {
    const m = build(1981);
    expect(m.kind).toBe('ds');
    expect(m.columns.AL.map(c => c.bestOf)).toEqual([5, 5]);
    expect(collectNodes(m.roots.AL).flatMap(n => n.slots.map(s => s.seed)).every(s => s === '')).toBeTrue();
    expect(m.roots.NL!.slots.map(s => s.team?.name)).toEqual(['Montreal Expos', 'Los Angeles Dodgers']);
    expect(m.roots.NL!.slots[0].team?.logo).toBeNull();     // Expos
  });
});

describe('buildBracket — League Championship Series only (1969–1993)', () => {
  it('1985: best-of-7 LCS', () => {
    const m = build(1985);
    expect(m.kind).toBe('lcs');
    expect(m.columns.AL.map(c => `${c.title}/${c.bestOf}`)).toEqual(['ALCS/7']);
    expect(m.roots.AL!.feeders).toEqual([null, null]);
    expect(m.roots.WS!.slots.map(s => s.team?.name)).toEqual(['Kansas City Royals', 'St. Louis Cardinals']);
  });

  it('1978 and 1993: every year in the era draws the same two-column-of-one shape', () => {
    for (const [year, bestOf, champ] of [[1978, 5, 'New York Yankees'], [1993, 7, 'Toronto Blue Jays']] as const) {
      const m = build(year);
      expect(m.kind).toBe('lcs');
      expect(m.columns.AL.map(c => c.bestOf)).toEqual([bestOf]);
      expect(m.columns.NL.map(c => c.bestOf)).toEqual([bestOf]);
      const lay = layoutBracket(m)!;
      expect(lay.columns).toBe(1);
      expect(lay.AL!.slots.length).toBe(2);
      expect(lay.NL!.slots.length).toBe(2);
      expect(lay.center.champion.slot?.team?.name).toBe(champ);
    }
  });

  it('1969: best-of-5 LCS, best-of-7 World Series', () => {
    const m = build(1969);
    expect(m.columns.NL.map(c => `${c.title}/${c.bestOf}`)).toEqual(['NLCS/5']);
    expect(m.roots.WS!.bestOf).toBe(7);
    expect(m.roots.WS!.statusText).toBe('T121 wins 4-1');
  });
});

describe('buildBracket — World Series only (pre-1969)', () => {
  it('1955: AL champion left, NL champion right, no league columns', () => {
    const m = build(1955);
    expect(m.kind).toBe('ws');
    expect(m.roots.AL).toBeNull();
    expect(m.columns.AL).toEqual([]);
    const ws = m.roots.WS!;
    expect(ws.slots.map(s => s.team?.name)).toEqual(['New York Yankees', 'Brooklyn Dodgers']);
    expect(ws.slots[1].team?.abbr).toBe('BKN');
    expect(ws.slots[1].team?.logo).toBeNull();
    expect(ws.statusText).toBe('BKN wins 4-3');
  });

  it('1919: orders by league and keeps the best-of-nine', () => {
    const ws = build(1919).roots.WS!;
    expect(ws.bestOf).toBe(9);
    expect(ws.slots.map(s => s.team?.abbr)).toEqual(['CHW', 'CIN']);
    expect(ws.statusText).toBe('CIN wins 5-3');
  });
});

describe('buildBracket — feed quirks', () => {
  it('counts a rained-out game that appears twice (postponed + makeup) once', () => {
    const raw = postseasonFixture(2025).filter(s => s.series!.id === 'L_2');
    const g = raw[0].games!;
    const postponed = JSON.parse(JSON.stringify(g[1]));
    postponed.status = { abstractGameState: 'Final', detailedState: 'Postponed' };
    postponed.teams.home.score = undefined; postponed.teams.away.score = undefined;
    g.splice(1, 0, postponed);                 // same gamePk twice
    const m = buildBracket({ season: 2025, series: [...postseasonFixture(2025).filter(s => s.series!.id !== 'L_2'), ...raw], info: infoFor(2025), resolve });
    expect(m.roots.NL!.statusText).toBe('LAD wins 4-0');
  });

  it('ignores non-postseason entries such as tiebreaker games', () => {
    const extra = { series: { id: 'R_136_49', gameType: 'R' }, games: [{ gamePk: 1, gameDate: '1995-10-02T20:00:00Z', status: { abstractGameState: 'Final' }, teams: { away: { team: { id: 108, name: 'California Angels' }, score: 1 }, home: { team: { id: 136, name: 'Seattle Mariners' }, score: 9 } } }] };
    const m = buildBracket({ season: 1995, series: [extra, ...postseasonFixture(1995)], info: infoFor(1995), resolve });
    expect(collectNodes(m.roots.WS).length).toBe(7);
  });
});

describe('layoutBracket', () => {
  const L = (m: BracketModel) => layoutBracket(m)!;
  const slotY = (lay: BracketLayout, league: 'AL' | 'NL', key: string) =>
    lay[league]!.slots.find(s => s.key === key)!.y;

  it('uses the proportions of MLB\'s graphic for the 12-team format', () => {
    const lay = L(build(2025));
    expect(lay.width).toBe(1536);
    expect(lay.R).toBe(640);
    expect(lay.columns).toBe(3);
    expect(lay.height).toBeGreaterThanOrEqual(780);
    expect(lay.height).toBeLessThanOrEqual(880);
  });

  it('puts every winner\'s slot halfway between the two slots of the series that feeds it', () => {
    for (const year of [2025, 2020, 2012, 1995, 1981]) {
      const m = build(year);
      const lay = L(m);
      for (const league of ['AL', 'NL'] as const) {
        for (const node of collectNodes(m.roots[league])) {
          node.feeders.forEach((f, i) => {
            if (!f) return;
            const mid = (slotY(lay, league, `${f.key}:0`) + slotY(lay, league, `${f.key}:1`)) / 2;
            expect(slotY(lay, league, `${node.key}:${i}`)).toBeCloseTo(mid, 6);
          });
        }
      }
    }
  });

  it('spaces the two LCS teams about 3.2 rows apart in the 12-team format (room for the label)', () => {
    const lay = L(build(2025));
    const d = slotY(lay, 'AL', 'L_1:1') - slotY(lay, 'AL', 'L_1:0');
    expect(d / PITCH).toBeCloseTo(3.2, 6);
  });

  it('meets the World Series at the same height from both leagues', () => {
    const lay = L(build(2025));
    const alMid = (slotY(lay, 'AL', 'L_1:0') + slotY(lay, 'AL', 'L_1:1')) / 2;
    const nlMid = (slotY(lay, 'NL', 'L_2:0') + slotY(lay, 'NL', 'L_2:1')) / 2;
    expect(alMid).toBeCloseTo(lay.height / 2, 6);
    expect(nlMid).toBeCloseTo(lay.height / 2, 6);
    expect(lay.center.top + lay.center.slots[0].y).toBeCloseTo(lay.height / 2, 6);
  });

  it('never overlaps two diamonds in a column', () => {
    for (const year of [2025, 2026, 2022, 2020, 2012, 1995, 1985, 1981]) {
      const lay = L(build(year, { projected: true }));
      for (const lg of [lay.AL!, lay.NL!]) {
        const byX = new Map<number, number[]>();
        lg.slots.forEach(s => byX.set(s.x, [...(byX.get(s.x) ?? []), s.y]));
        byX.forEach(ys => {
          const sorted = [...ys].sort((a, b) => a - b);
          for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(PITCH - 0.001);
        });
      }
    }
  });

  it('keeps round labels clear of the diamonds', () => {
    for (const year of [2025, 2020, 2012, 1995, 1985]) {
      const lay = L(build(year));
      for (const lg of [lay.AL!, lay.NL!]) {
        for (const label of lg.labels) {
          const ys = lg.slots.filter(s => s.x === label.x).map(s => s.y);
          ys.forEach(y => expect(Math.abs(y - label.y)).toBeGreaterThanOrEqual(56 + 40));
        }
      }
    }
  });

  it('shrinks to fewer columns for older formats', () => {
    expect(L(build(2012)).columns).toBe(3);
    expect(L(build(1995)).columns).toBe(2);
    expect(L(build(1995)).width).toBeCloseTo(2 * 2 * (640 / 3) + 256, 6);
    expect(L(build(1985)).columns).toBe(1);
    const ws = L(build(1955));
    expect(ws.columns).toBe(0);
    expect(ws.AL).toBeNull();
    expect(ws.NL).toBeNull();
    expect(ws.height).toBeGreaterThanOrEqual(600);
  });

  it('places the champion in the top diamond only once the World Series is decided', () => {
    expect(L(build(2025)).center.champion.slot?.team?.abbr).toBe('LAD');
    expect(L(build(2025)).center.championLabel?.text).toBe('CHAMPIONS');
    expect(L(build(2026)).center.champion.slot).toBeNull();
    expect(L(build(2026)).center.championLabel).toBeNull();
  });

  it('adds a "Best of N" pill under every column', () => {
    const lay = L(build(2025));
    expect(lay.AL!.pills.map(p => p.text)).toEqual(['Best of 3', 'Best of 5', 'Best of 7']);
    expect(L(build(2012)).AL!.pills[0].text).toBe('Single game');
    expect(lay.center.pill.text).toBe('Best of 7');
    expect(L(build(1919)).center.pill.text).toBe('Best of 9');
  });
});
