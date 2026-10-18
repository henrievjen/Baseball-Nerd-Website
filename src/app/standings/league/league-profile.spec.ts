import { LEAGUES } from '../../shared/leagues';
import { latestSeason, leagueProfile, seasonLabel, seasonsFor } from './league-profile';

describe('leagueProfile', () => {
  it('covers every league on the Scores page except MLB, which has its own page', () => {
    expect(leagueProfile('mlb')).toBeNull();
    expect(leagueProfile('nope')).toBeNull();
    for (const l of LEAGUES.filter(x => x.id !== 'mlb')) {
      const p = leagueProfile(l.id);
      expect(p).withContext(l.id).not.toBeNull();
      expect(p!.sportId).withContext(l.id).toBe(l.sportId);
      expect(p!.leagueIds).withContext(l.id).toEqual(l.leagueIds);
    }
  });

  it('knows which levels split the season', () => {
    expect(['aa', 'higha', 'a'].every(id => leagueProfile(id)!.halves)).toBeTrue();
    expect(['aaa', 'rok', 'lmp', 'afl'].some(id => leagueProfile(id)!.halves)).toBeFalse();
  });

  it('only the minor-league levels look their leagues up by season', () => {
    expect(leagueProfile('aaa')!.leagueIds).toBeUndefined();
    expect(leagueProfile('lmp')!.leagueIds).toEqual([132]);
  });
});

describe('season helpers', () => {
  const oct2026 = new Date(2026, 9, 18);
  const mar2027 = new Date(2027, 2, 10);
  const jan2027 = new Date(2027, 0, 10);

  it('lists summer leagues up to the current year, falling back before spring training ends', () => {
    expect(latestSeason({ winter: false }, oct2026)).toBe(2026);
    expect(latestSeason({ winter: false }, mar2027)).toBe(2027);
    expect(latestSeason({ winter: false }, jan2027)).toBe(2026);
  });

  it('winter seasons start in October', () => {
    expect(latestSeason({ winter: true }, oct2026)).toBe(2026);
    expect(latestSeason({ winter: true }, jan2027)).toBe(2026);
    expect(latestSeason({ winter: true }, new Date(2026, 8, 30))).toBe(2025);
  });

  it('seasonsFor is newest first and stops at the league\'s first season', () => {
    const s = seasonsFor({ winter: false, firstSeason: 2023 }, oct2026);
    expect(s).toEqual([2026, 2025, 2024, 2023]);
  });

  it('labels winter seasons across the new year', () => {
    expect(seasonLabel({ winter: true }, 2025)).toBe('2025–26');
    expect(seasonLabel({ winter: true }, 2099)).toBe('2099–00');
    expect(seasonLabel({ winter: false }, 2025)).toBe('2025');
  });
});
