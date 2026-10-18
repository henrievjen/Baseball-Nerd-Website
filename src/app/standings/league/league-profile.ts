/**
 * How the Standings page treats each league in shared/leagues.ts.
 *
 * MLB keeps its own bespoke page (division grids, Wild Card, bracket). Every other
 * league is rendered from the data its feed returns — a table per league, divisions
 * only when the feed actually has them, a postseason board only when postseason
 * games exist — so the profile only has to say where to find the data and which
 * seasons exist.
 */
import { LeagueDef, leagueById } from '../../shared/leagues';

export interface LeagueProfile {
  def: LeagueDef;
  sportId: number;
  /**
   * Fixed MLB Stats API league ids (winter / fall leagues). Omitted for the
   * minor-league levels, whose leagues change from year to year and are looked up
   * for the chosen season.
   */
  leagueIds?: number[];
  /** First season that returns standings (checked against the live API). */
  firstSeason: number;
  /** The season runs across New Year, so season 2025 is shown as "2025–26". */
  winter: boolean;
  /** Split-season level: offer First half / Second half when the feed has them. */
  halves: boolean;
}

/** Everything but MLB. Seasons below are the earliest each feed was seen to return data. */
const EXTRA: Record<string, Omit<LeagueProfile, 'def' | 'sportId' | 'leagueIds'>> = {
  afl:   { firstSeason: 2006, winter: false, halves: false },
  lidom: { firstSeason: 2008, winter: true,  halves: false },
  lmp:   { firstSeason: 2010, winter: true,  halves: false },
  lvbp:  { firstSeason: 2008, winter: true,  halves: false },
  prwl:  { firstSeason: 2010, winter: true,  halves: false },
  abl:   { firstSeason: 2010, winter: true,  halves: false },
  cs:    { firstSeason: 2010, winter: false, halves: false },
  aaa:   { firstSeason: 2005, winter: false, halves: false },
  aa:    { firstSeason: 2005, winter: false, halves: true },
  higha: { firstSeason: 2005, winter: false, halves: true },
  a:     { firstSeason: 2005, winter: false, halves: true },
  rok:   { firstSeason: 2005, winter: false, halves: false },
  intl:  { firstSeason: 2006, winter: false, halves: false }
};

/** The profile for a registry league, or null for MLB (which has its own page) and unknown ids. */
export function leagueProfile(id: string): LeagueProfile | null {
  const def = leagueById(id);
  const extra = EXTRA[id];
  if (!def || !extra) return null;
  return { def, sportId: def.sportId, leagueIds: def.leagueIds, ...extra };
}

/** The most recent season worth listing on `now` (winter seasons begin in October). */
export function latestSeason(p: Pick<LeagueProfile, 'winter'>, now: Date): number {
  const y = now.getFullYear();
  const m = now.getMonth();          // 0 = January
  return p.winter ? (m >= 9 ? y : y - 1) : (m >= 2 ? y : y - 1);
}

/** Season picker values, newest first. */
export function seasonsFor(p: Pick<LeagueProfile, 'winter' | 'firstSeason'>, now: Date): number[] {
  const out: number[] = [];
  for (let y = latestSeason(p, now); y >= p.firstSeason; y--) out.push(y);
  return out;
}

/** "2025" for most leagues, "2025–26" for the winter ones. */
export function seasonLabel(p: Pick<LeagueProfile, 'winter'>, season: number): string {
  return p.winter ? `${season}–${String((season + 1) % 100).padStart(2, '0')}` : String(season);
}
