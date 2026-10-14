/**
 * League registry for the multi-league Scores page.
 *
 * Every league below is served by the same keyless MLB Stats API
 * (statsapi.mlb.com) the site already uses for MLB, so games come back in the
 * exact same shape (linescore, leagueRecord, status, …) and the existing
 * score card / game-detail modal work unchanged.
 *
 * How the ids map (verified against the live API):
 *   sportId 1   → Major League Baseball
 *   sportId 17  → "Winter Leagues" — one sport that contains AFL, LIDOM, LMP,
 *                 LVBP, the Puerto Rican league, ABL and the Caribbean Series,
 *                 told apart by leagueId
 *   sportId 11–16 → the Minor League levels
 *   sportId 51  → International (WBC, exhibitions, …)
 *
 * NPB (sportId 31), KBO (32) and CPBL (league 552) appear in the MLB catalog
 * but carry NO game data, so they are intentionally not registered here. To
 * add a league from a different source later, give it a new `provider` value
 * and teach LeagueScoresService how to fetch it — the page itself doesn't care.
 */

export type LeagueGroupId = 'majors' | 'fall-winter' | 'minors' | 'international';

export interface LeagueDef {
  /** Stable id used in the URL (?leagues=mlb,afl) and localStorage. */
  id: string;
  name: string;
  /** Short chip label. */
  short: string;
  region: string;
  group: LeagueGroupId;
  /** Where the data comes from. Only the MLB Stats API is wired up today. */
  provider: 'mlb-stats';
  sportId: number;
  /** MLB Stats API league ids within the sport. Omit to request the whole sport. */
  leagueIds?: number[];
  /** Games that can't be matched to a more specific league are filed here. */
  catchAll?: boolean;
}

export interface LeagueGroup {
  id: LeagueGroupId;
  label: string;
  leagues: LeagueDef[];
}

export const LEAGUES: LeagueDef[] = [
  { id: 'mlb',   name: 'Major League Baseball',                    short: 'MLB',   region: 'United States',      group: 'majors',      provider: 'mlb-stats', sportId: 1 },

  { id: 'afl',   name: 'Arizona Fall League',                      short: 'AFL',   region: 'United States',      group: 'fall-winter', provider: 'mlb-stats', sportId: 17, leagueIds: [119] },
  { id: 'lidom', name: 'Liga de Béisbol Dominicano',               short: 'LIDOM', region: 'Dominican Republic', group: 'fall-winter', provider: 'mlb-stats', sportId: 17, leagueIds: [131] },
  { id: 'lmp',   name: 'Liga Mexicana del Pacífico',               short: 'LMP',   region: 'Mexico',             group: 'fall-winter', provider: 'mlb-stats', sportId: 17, leagueIds: [132] },
  { id: 'lvbp',  name: 'Liga Venezolana de Béisbol Profesional',   short: 'LVBP',  region: 'Venezuela',          group: 'fall-winter', provider: 'mlb-stats', sportId: 17, leagueIds: [135] },
  { id: 'prwl',  name: 'Liga de Béisbol Profesional Roberto Clemente', short: 'PRWL', region: 'Puerto Rico',    group: 'fall-winter', provider: 'mlb-stats', sportId: 17, leagueIds: [133] },
  { id: 'abl',   name: 'Australian Baseball League',               short: 'ABL',   region: 'Australia',          group: 'fall-winter', provider: 'mlb-stats', sportId: 17, leagueIds: [595] },
  { id: 'cs',    name: 'Caribbean Series',                         short: 'Caribbean Series', region: 'Caribbean', group: 'fall-winter', provider: 'mlb-stats', sportId: 17, leagueIds: [162] },

  { id: 'aaa',   name: 'Triple-A',                                 short: 'AAA',   region: 'Minor Leagues',      group: 'minors',      provider: 'mlb-stats', sportId: 11 },
  { id: 'aa',    name: 'Double-A',                                 short: 'AA',    region: 'Minor Leagues',      group: 'minors',      provider: 'mlb-stats', sportId: 12 },
  { id: 'higha', name: 'High-A',                                   short: 'High-A', region: 'Minor Leagues',     group: 'minors',      provider: 'mlb-stats', sportId: 13 },
  { id: 'a',     name: 'Single-A',                                 short: 'A',     region: 'Minor Leagues',      group: 'minors',      provider: 'mlb-stats', sportId: 14 },
  { id: 'rok',   name: 'Rookie & Complex Leagues',                 short: 'Rookie', region: 'Minor Leagues',     group: 'minors',      provider: 'mlb-stats', sportId: 16 },

  { id: 'intl',  name: 'International (WBC & more)',               short: 'Intl',  region: 'International',      group: 'international', provider: 'mlb-stats', sportId: 51, catchAll: true },
];

export const DEFAULT_LEAGUE_IDS: string[] = ['mlb'];

export const LEAGUE_GROUP_LABELS: Record<LeagueGroupId, string> = {
  'majors': 'Majors',
  'fall-winter': 'Fall & Winter',
  'minors': 'Minors',
  'international': 'International'
};

export function leagueById(id: string): LeagueDef | undefined {
  return LEAGUES.find(l => l.id === id);
}

/** Leagues bucketed by group, in registry order. */
export function leagueGroups(): LeagueGroup[] {
  const groups: LeagueGroup[] = [];
  for (const l of LEAGUES) {
    let g = groups.find(x => x.id === l.group);
    if (!g) { g = { id: l.group, label: LEAGUE_GROUP_LABELS[l.group], leagues: [] }; groups.push(g); }
    g.leagues.push(l);
  }
  return groups;
}

/**
 * Cleans an untrusted list of league ids (from the URL or localStorage):
 * drops unknown ids and duplicates, returns them in registry order, and falls
 * back to the default when nothing valid is left.
 */
export function sanitizeLeagueIds(ids: readonly string[] | null | undefined): string[] {
  const wanted = new Set(ids ?? []);
  const clean = LEAGUES.filter(l => wanted.has(l.id)).map(l => l.id);
  return clean.length ? clean : [...DEFAULT_LEAGUE_IDS];
}
