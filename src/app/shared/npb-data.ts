/**
 * NPB (Nippon Professional Baseball) data — types and parsing for the season files
 * the Standings page builds its tables from.
 *
 * The MLB Stats API lists NPB (sportId 31) but holds no games for it, so NPB comes
 * from the community `dentearl/npb-data` project: one static JSON file per season,
 * rebuilt from npb.jp by a scheduled GitHub Action a few times a day. That makes it
 * free and effectively unlimited, but also:
 *   - NOT real-time (it only changes when the Action runs),
 *   - regular season only (no Climax Series / Japan Series),
 *   - scores only — no innings, hits, pitchers, box scores or real start times
 *     (every game carries a placeholder 18:00 JST start),
 *   - occasionally stale (a scheduled game whose result never arrived).
 * NPB is not offered on the Scores page for these reasons.
 * Everything here is pure so it can be unit-tested without a browser.
 */

/** First season the data set covers. */
export const NPB_FIRST_SEASON = 2021;

const NPB_BASE = 'https://raw.githubusercontent.com/dentearl/npb-data/main/data/npb';

export function npbSeasonUrl(season: number): string {
  return `${NPB_BASE}/${season}.json`;
}

export interface NpbRawTeam {
  id: number;
  name: string;
  abbrev?: string;
  league?: string;
  /** "Central League" or "Pacific League". */
  division?: string;
}

export interface NpbRawSide {
  team: NpbRawTeam;
  score: number | null;
  isWinner?: boolean;
}

export interface NpbRawGame {
  /** Usually a 13-digit string; a few unplayed placeholders use text ids like "20261015_HAN_DeNA". */
  gamePk: string;
  gameDate: string;
  /** Game date in Japan, YYYY-MM-DD. */
  officialDate: string;
  status: { detailedState: string; abstractGameState?: string };
  teams: { away: NpbRawSide; home: NpbRawSide };
  isTie?: boolean;
  isCancelled?: boolean;
}

export interface NpbSeason {
  games: NpbRawGame[];
}

export const EMPTY_NPB_SEASON: NpbSeason = { games: [] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function usable(g: any): g is NpbRawGame {
  return !!g
    && DATE_RE.test(String(g.officialDate ?? ''))
    && g.teams?.away?.team?.id != null
    && g.teams?.home?.team?.id != null
    && !!g.teams.away.team.name
    && !!g.teams.home.team.name;
}

/**
 * Raw JSON → a season. Accepts the file's top-level array (or `{ games: [...] }`),
 * silently drops malformed or duplicated entries, and throws only when the payload
 * isn't a game list at all (so the caller can treat it as a failed request).
 */
export function parseNpbSeason(json: unknown): NpbSeason {
  const list = Array.isArray(json) ? json : (json as any)?.games;
  if (!Array.isArray(list)) throw new Error('Unexpected NPB data format');

  const seen = new Set<string>();
  const games: NpbRawGame[] = [];
  for (const g of list) {
    if (!usable(g)) continue;
    const pk = String(g.gamePk);
    if (seen.has(pk)) continue;
    seen.add(pk);
    games.push(g);
  }
  return { games };
}
