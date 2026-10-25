/**
 * League registry for the multi-league Scores and Standings pages.
 *
 * Every league below except NPB is served by the same keyless MLB Stats API
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
 * but carry NO game data. NPB therefore comes from a different source — the
 * community-maintained `dentearl/npb-data` JSON files (see npb-data.service.ts),
 * flagged `provider: 'npb-data'`, shown on the Standings page only (`onScores:
 * false`), and carrying a `note` the page shows as a "not real-time / not
 * complete" notice. KBO and CPBL are not registered. To add another league from a
 * different source, give it a new `provider` value and teach the page's service
 * how to fetch it.
 */

export type LeagueGroupId = 'majors' | 'asia' | 'fall-winter' | 'minors' | 'international';

export interface LeagueDef {
  /** Stable id used in the URL (?leagues=mlb,afl) and localStorage. */
  id: string;
  name: string;
  /** Short chip label. */
  short: string;
  region: string;
  group: LeagueGroupId;
  /** Where the data comes from: the MLB Stats API, or the community NPB data set. */
  provider: 'mlb-stats' | 'npb-data';
  /** MLB Stats API sport id (for 'npb-data' leagues this is only the catalog id, which holds no game data). */
  sportId: number;
  /** MLB Stats API league ids within the sport. Omit to request the whole sport. */
  leagueIds?: number[];
  /** Games that can't be matched to a more specific league are filed here. */
  catchAll?: boolean;
  /** Offered on the Scores page. Defaults to true; false for leagues that only have standings (NPB). */
  onScores?: boolean;
  /**
   * A data-quality warning shown on the Standings page whenever the league is on screen —
   * set for sources that are not live or not complete. `standingsNote` adds a sentence.
   */
  note?: string;
  standingsNote?: string;
}

export interface LeagueGroup {
  id: LeagueGroupId;
  label: string;
  leagues: LeagueDef[];
}

export const LEAGUES: LeagueDef[] = [
  { id: 'mlb',   name: 'Major League Baseball',                    short: 'MLB',   region: 'United States',      group: 'majors',      provider: 'mlb-stats', sportId: 1 },

  { id: 'npb',   name: 'Nippon Professional Baseball',             short: 'NPB',   region: 'Japan',              group: 'asia',        provider: 'npb-data',  sportId: 31,
    onScores: false,
    note: 'NPB data is not real-time and not fully complete. It comes from a community-maintained data set that is refreshed only a few times a day, so results can arrive hours late and a game can be missing.',
    standingsNote: 'Tables are worked out from the regular-season games in that data set, so a missing game means a missing win or loss. The data set has no playoff games: Climax Series and Japan Series results on the Postseason tab are entered by hand and may lag.' },

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
  'asia': 'Asia',
  'fall-winter': 'Fall & Winter',
  'minors': 'Minors',
  'international': 'International'
};

export function leagueById(id: string): LeagueDef | undefined {
  return LEAGUES.find(l => l.id === id);
}

/** The leagues the Scores page offers (everything except standings-only leagues such as NPB). */
export function scoreLeagues(): LeagueDef[] {
  return LEAGUES.filter(l => l.onScores !== false);
}

/** Leagues bucketed by group, in registry order. `onlyScores` leaves out standings-only leagues. */
export function leagueGroups(onlyScores = false): LeagueGroup[] {
  const groups: LeagueGroup[] = [];
  for (const l of onlyScores ? scoreLeagues() : LEAGUES) {
    let g = groups.find(x => x.id === l.group);
    if (!g) { g = { id: l.group, label: LEAGUE_GROUP_LABELS[l.group], leagues: [] }; groups.push(g); }
    g.leagues.push(l);
  }
  return groups;
}

/**
 * Cleans an untrusted list of Scores-page league ids (from the URL or localStorage):
 * drops unknown ids, standings-only leagues (NPB) and duplicates, returns them in registry order, and falls
 * back to the default when nothing valid is left.
 */
export function sanitizeLeagueIds(ids: readonly string[] | null | undefined): string[] {
  const wanted = new Set(ids ?? []);
  const clean = scoreLeagues().filter(l => wanted.has(l.id)).map(l => l.id);
  return clean.length ? clean : [...DEFAULT_LEAGUE_IDS];
}
