/**
 * NPB standings, worked out from game results.
 *
 * The NPB data set has games but no standings table, so the tables are computed here,
 * the way NPB itself does it:
 *   - only finished games count (postponed and unplayed games don't),
 *   - winning percentage is wins / (wins + losses) — drawn games are listed (T) but
 *     are left out of the percentage,
 *   - games behind = ((leader wins − wins) + (losses − leader losses)) / 2,
 *   - interleague games count in each club's own league (Central or Pacific) table.
 * Checked against npb.jp's final 2026 tables (all twelve W-L-T records and GB match).
 *
 * The output is shaped like a `v1/standings` response so the same `buildLgStandings`
 * that draws every other league orders it and works out games behind.
 */
import { NpbRawGame, NpbRawTeam } from '../../shared/npb-data';

const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A game that has a result and counts toward the standings. */
export function countsForStandings(g: NpbRawGame): boolean {
  return g.status?.detailedState === 'Final'
    && !g.isCancelled
    && isScore(g.teams.away.score)
    && isScore(g.teams.home.score);
}

const LEAGUE_IDS: Record<string, number> = { 'Central League': 3101, 'Pacific League': 3102 };

interface Tally { team: NpbRawTeam; wins: number; losses: number; ties: number }

/** `v1/standings`-shaped records, one per NPB league. Empty when no game has been played yet. */
export function buildNpbRecords(games: readonly NpbRawGame[]): any[] {
  const tallies = new Map<number, Tally>();
  const tallyOf = (team: NpbRawTeam): Tally => {
    let t = tallies.get(team.id);
    if (!t) { t = { team, wins: 0, losses: 0, ties: 0 }; tallies.set(team.id, t); }
    return t;
  };

  let played = 0;
  for (const g of games) {
    const away = tallyOf(g.teams.away.team);
    const home = tallyOf(g.teams.home.team);
    if (!countsForStandings(g)) continue;
    played++;
    const a = g.teams.away.score as number;
    const h = g.teams.home.score as number;
    if (a === h) { away.ties++; home.ties++; }
    else if (a > h) { away.wins++; home.losses++; }
    else { home.wins++; away.losses++; }
  }
  if (!played) return [];

  const byLeague = new Map<string, Tally[]>();
  for (const t of tallies.values()) {
    const name = t.team.division || 'NPB';
    byLeague.set(name, [...(byLeague.get(name) ?? []), t]);
  }

  return [...byLeague.entries()].map(([name, teams]) => ({
    league: { id: LEAGUE_IDS[name] ?? 3100, name },
    teamRecords: teams.map(t => ({
      team: { id: t.team.id, name: t.team.name, abbreviation: t.team.abbrev },
      wins: t.wins,
      losses: t.losses,
      ties: t.ties
    }))
  }));
}

/** Date (YYYY-MM-DD, Japan) of the latest finished game, or null when none. */
export function latestResultDate(games: readonly NpbRawGame[]): string | null {
  let latest: string | null = null;
  for (const g of games) {
    if (countsForStandings(g) && (latest == null || g.officialDate > latest)) latest = g.officialDate;
  }
  return latest;
}
