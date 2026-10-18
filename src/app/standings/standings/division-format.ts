/**
 * Standings → Division tab, for seasons that had no divisions.
 *
 * Divisions began in 1969. Before that each league was a single table and the team with
 * the best record won the pennant, so the feed's division records are really one league
 * table each. This file says when that applies and builds the league tables to show
 * instead of division tables.
 */

export interface NoDivisionsNotice {
  headline: string;
  note: string;
}

export interface LeagueTableRow {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  pct: string;
  gb: string;
  rank: number;
}

export interface LeagueTable {
  key: 'AL' | 'NL';
  name: string;
  teams: LeagueTableRow[];
}

/** A notice for seasons before divisions existed (1901–1968); null from 1969 on. */
export function noDivisionsNotice(year: number): NoDivisionsNotice | null {
  if (year >= 1969) return null;
  const ws = year <= 1902 ? ' The first World Series was played in 1903.'
    : year === 1904 ? ' No World Series was played in 1904.' : '';
  return {
    headline: `${year} · No divisions`,
    note: 'Each league was a single table before divisions began in 1969. The team with the best record in each league won the pennant, and the two pennant winners met in the World Series.' + ws
  };
}

const LEAGUES: Record<number, { key: 'AL' | 'NL'; name: string }> = {
  103: { key: 'AL', name: 'American League' },
  104: { key: 'NL', name: 'National League' }
};

const rankOf = (v: unknown): number => { const n = parseInt(String(v), 10); return Number.isFinite(n) && n > 0 ? n : 0; };

/** One table per league, best record first, built from the regular-season standings records. */
export function buildLeagueTables(records: any[]): LeagueTable[] {
  const out = new Map<'AL' | 'NL', LeagueTable>();
  for (const rec of records ?? []) {
    const meta = LEAGUES[rec.league?.id];
    if (!meta) continue;
    let table = out.get(meta.key);
    if (!table) { table = { key: meta.key, name: meta.name, teams: [] }; out.set(meta.key, table); }
    for (const tr of rec.teamRecords ?? []) {
      table.teams.push({
        teamId: tr.team?.id, teamName: tr.team?.name,
        wins: tr.wins, losses: tr.losses, pct: tr.winningPercentage, gb: tr.gamesBack ?? '',
        rank: rankOf(tr.leagueRank)
      });
    }
  }
  const tables = (['AL', 'NL'] as const).map(k => out.get(k)).filter((t): t is LeagueTable => !!t && t.teams.length > 0);
  for (const t of tables) {
    t.teams.sort((a, b) => ((a.rank || 99) - (b.rank || 99)) || ((parseFloat(b.pct) || 0) - (parseFloat(a.pct) || 0)));
    t.teams.forEach((r, i) => { if (!r.rank) r.rank = i + 1; });
  }
  return tables;
}
