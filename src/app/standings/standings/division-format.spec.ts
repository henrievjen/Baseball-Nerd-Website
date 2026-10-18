import { buildLeagueTables, noDivisionsNotice } from './division-format';

const tr = (id: number, name: string, w: number, l: number, o: { lr?: number; gb?: string } = {}) => ({
  team: { id, name }, wins: w, losses: l, winningPercentage: (w / (w + l)).toFixed(3).replace(/^0/, ''),
  gamesBack: o.gb ?? '-', leagueRank: o.lr != null ? String(o.lr) : undefined
});

describe('noDivisionsNotice', () => {
  it('applies to every season before divisions began in 1969', () => {
    for (const y of [1901, 1903, 1904, 1927, 1955, 1968]) {
      const n = noDivisionsNotice(y);
      expect(n).withContext(String(y)).not.toBeNull();
      expect(n!.headline).withContext(String(y)).toBe(`${y} · No divisions`);
      expect(n!.note).toContain('single table');
      expect(n!.note).toContain('1969');
    }
  });

  it('is absent from 1969 on', () => {
    for (const y of [1969, 1981, 1994, 2025]) expect(noDivisionsNotice(y)).withContext(String(y)).toBeNull();
  });

  it('adds the World Series caveats for 1901–02 and 1904', () => {
    expect(noDivisionsNotice(1902)!.note).toContain('first World Series was played in 1903');
    expect(noDivisionsNotice(1904)!.note).toContain('No World Series was played in 1904');
    expect(noDivisionsNotice(1955)!.note).not.toContain('No World Series');
  });
});

describe('buildLeagueTables', () => {
  const records = [
    { league: { id: 103 }, teamRecords: [tr(113, 'Cleveland Indians', 93, 61, { lr: 2, gb: '3.0' }), tr(147, 'New York Yankees', 96, 58, { lr: 1 })] },
    { league: { id: 104 }, teamRecords: [tr(144, 'Milwaukee Braves', 85, 69, { lr: 2, gb: '13.5' }), tr(119, 'Brooklyn Dodgers', 98, 55, { lr: 1 })] }
  ];

  it('makes one table per league, best record first', () => {
    const t = buildLeagueTables(records);
    expect(t.map(x => x.name)).toEqual(['American League', 'National League']);
    expect(t[0].teams.map(r => `${r.rank}:${r.teamName}`)).toEqual(['1:New York Yankees', '2:Cleveland Indians']);
    expect(t[1].teams.map(r => `${r.rank}:${r.teamName}`)).toEqual(['1:Brooklyn Dodgers', '2:Milwaukee Braves']);
    expect(t[0].teams[1].gb).toBe('3.0');
  });

  it('falls back to win percentage when the feed has no league rank', () => {
    const t = buildLeagueTables([{ league: { id: 103 }, teamRecords: [tr(1, 'B', 60, 94), tr(2, 'A', 94, 60)] }]);
    expect(t[0].teams.map(r => `${r.rank}:${r.teamName}`)).toEqual(['1:A', '2:B']);
  });

  it('merges split records for the same league and ignores unknown leagues or empty input', () => {
    const t = buildLeagueTables([
      { league: { id: 103 }, teamRecords: [tr(1, 'A', 90, 64)] },
      { league: { id: 103 }, teamRecords: [tr(2, 'B', 80, 74)] },
      { league: { id: 999 }, teamRecords: [tr(3, 'C', 70, 84)] }
    ]);
    expect(t.length).toBe(1);
    expect(t[0].teams.length).toBe(2);
    expect(buildLeagueTables([])).toEqual([]);
  });
});
