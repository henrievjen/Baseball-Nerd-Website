import { buildLgStandings, gamesBack, shortDivisionName } from './league-standings-model';

const tr = (id: number, name: string, w: number, l: number, o: { dr?: number; lr?: number; pct?: string; abbr?: string } = {}) => ({
  team: { id, name, abbreviation: o.abbr },
  wins: w, losses: l,
  winningPercentage: o.pct ?? (w / (w + l)).toFixed(3).replace(/^0/, ''),
  divisionRank: o.dr != null ? String(o.dr) : undefined,
  leagueRank: o.lr != null ? String(o.lr) : undefined
});

describe('buildLgStandings', () => {
  const aaa = [
    { league: { id: 117, name: 'International League' }, division: { id: 1, name: 'International League East' },
      teamRecords: [tr(1, 'Scranton RailRiders', 87, 63, { dr: 2 }), tr(2, 'Jacksonville Jumbo Shrimp', 89, 61, { dr: 1 })] },
    { league: { id: 117, name: 'International League' }, division: { id: 2, name: 'International League West' },
      teamRecords: [tr(3, 'Indianapolis Indians', 88, 62, { dr: 1 }), tr(4, 'Nashville Sounds', 70, 80, { dr: 2 })] },
    { league: { id: 112, name: 'Pacific Coast League' }, division: { id: 3, name: 'Pacific Coast League East' },
      teamRecords: [tr(5, 'Oklahoma City Comets', 84, 66, { dr: 1 })] },
    { league: { id: 112, name: 'Pacific Coast League' }, division: { id: 4, name: 'Pacific Coast League West' },
      teamRecords: [tr(6, 'Tacoma Rainiers', 86, 64, { dr: 1 })] }
  ];

  it('makes one block per league with a combined table and its divisions', () => {
    const v = buildLgStandings(aaa);
    expect(v.hasDivisions).toBeTrue();
    expect(v.blocks.map(b => b.name)).toEqual(['International League', 'Pacific Coast League']);
    const il = v.blocks[0];
    expect(il.table.map(r => `${r.rank}:${r.teamName}`)).toEqual([
      '1:Jacksonville Jumbo Shrimp', '2:Indianapolis Indians', '3:Scranton RailRiders', '4:Nashville Sounds'
    ]);
    expect(il.divisions.map(d => d.short)).toEqual(['East', 'West']);
    expect(il.divisions[0].rows.map(r => r.teamName)).toEqual(['Jacksonville Jumbo Shrimp', 'Scranton RailRiders']);
  });

  it('works out games behind from wins and losses', () => {
    const il = buildLgStandings(aaa).blocks[0];
    expect(il.table.map(r => r.gb)).toEqual(['—', '1.0', '2.0', '19.0']);
    // within a division the leader is the division's own best team
    expect(il.divisions[1].rows.map(r => r.gb)).toEqual(['—', '18.0']);
    expect(gamesBack({ wins: 10, losses: 5 }, { wins: 8, losses: 6 })).toBe('1.5');
    expect(gamesBack({ wins: 10, losses: 5 }, { wins: 9, losses: 4 })).toBe('—');   // fewer games played: never negative
  });

  it('ignores a wrong feed rank — the table follows win percentage', () => {
    const v = buildLgStandings([{ league: { id: 1, name: 'X' }, teamRecords: [tr(1, 'Low', 1, 9, { lr: 1 }), tr(2, 'High', 9, 1, { lr: 2 })] }]);
    expect(v.blocks[0].table.map(r => r.teamName)).toEqual(['High', 'Low']);
  });

  it('breaks exact ties with the feed rank', () => {
    const v = buildLgStandings([{ league: { id: 1, name: 'X' }, teamRecords: [tr(1, 'B', 5, 5, { lr: 2 }), tr(2, 'A', 5, 5, { lr: 1 })] }]);
    expect(v.blocks[0].table.map(r => r.teamName)).toEqual(['A', 'B']);
  });

  it('a league with no division (winter leagues, the Northwest League) is a single table', () => {
    const lmp = [{ league: { id: 132, name: 'Liga Mexicana del Pacifico' }, teamRecords: [tr(1, 'Tomateros', 20, 10), tr(2, 'Yaquis', 18, 12)] }];
    const v = buildLgStandings(lmp);
    expect(v.hasDivisions).toBeFalse();
    expect(v.blocks[0].divisions).toEqual([]);
    expect(v.blocks[0].table.length).toBe(2);
  });

  it('a lone division that is the whole league is not shown as divisions', () => {
    const v = buildLgStandings([{ league: { id: 5, name: 'L' }, division: { id: 9, name: 'L' }, teamRecords: [tr(1, 'A', 3, 1), tr(2, 'B', 1, 3)] }]);
    expect(v.hasDivisions).toBeFalse();
  });

  it('only the leagues that have divisions list them', () => {
    const v = buildLgStandings([
      ...aaa.slice(0, 2),
      { league: { id: 126, name: 'Northwest League' }, teamRecords: [tr(7, 'Eugene Emeralds', 81, 60)] }
    ]);
    expect(v.hasDivisions).toBeTrue();
    expect(v.blocks.find(b => b.name === 'Northwest League')!.divisions).toEqual([]);
    expect(v.blocks.find(b => b.name === 'International League')!.divisions.length).toBe(2);
  });

  it('formats win percentage and badge text', () => {
    const v = buildLgStandings([{ league: { id: 1, name: 'X' }, teamRecords: [
      tr(1, 'Tigres de Aragua', 0, 0, { pct: '.000' }), { team: { id: 2, name: 'Cardenales' }, wins: 3, losses: 1 }
    ] }]);
    const rows = v.blocks[0].table;
    expect(rows.find(r => r.teamId === 2)!.pct).toBe('.750');
    expect(rows.find(r => r.teamId === 2)!.abbr).toBe('CAR');
    expect(rows.find(r => r.teamId === 1)!.abbr).toBe('TDA');
  });

  it('sums games and tolerates empty or odd input', () => {
    expect(buildLgStandings(aaa).games).toBe(900);
    expect(buildLgStandings([])).toEqual({ blocks: [], hasDivisions: false, showTies: false, games: 0 });
    expect(buildLgStandings(null)).toEqual({ blocks: [], hasDivisions: false, showTies: false, games: 0 });
    expect(buildLgStandings([{ league: { id: 1 }, teamRecords: [] }]).blocks).toEqual([]);
  });
});

describe('shortDivisionName', () => {
  it('drops the league prefix', () => {
    expect(shortDivisionName('Arizona Complex League East', 'Arizona Complex League')).toBe('East');
    expect(shortDivisionName('American', 'Arizona Fall League')).toBe('American');
    expect(shortDivisionName('Pacific Coast League', 'Pacific Coast League')).toBe('Pacific Coast League');
  });
});
