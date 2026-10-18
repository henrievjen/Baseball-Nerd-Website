/**
 * Turns a `v1/standings` response for any non-MLB league into the tables the
 * Standings page draws.
 *
 * Nothing here assumes a league's shape: records are grouped by the league they
 * name, divisions appear only when the feed has more than one for a league, and
 * games-behind is worked out from wins and losses (the feed's own value is
 * unreliable early in a season and for split-season halves).
 */

export interface LgRow {
  teamId: number;
  teamName: string;
  /** Short label for the initials badge (logos for these clubs aren't on the MLB CDN). */
  abbr: string;
  wins: number;
  losses: number;
  pct: string;
  /** "—" for the leader. */
  gb: string;
  /** 1-based place within the table it appears in. */
  rank: number;
}

export interface LgDivision {
  id: number;
  /** Full name from the feed ("International League East"). */
  name: string;
  /** Name without the league prefix ("East"). */
  short: string;
  rows: LgRow[];
}

export interface LgBlock {
  leagueId: number;
  name: string;
  /** Every team in the league, best record first. */
  table: LgRow[];
  /** Two or more divisions, or none when the league plays a single table. */
  divisions: LgDivision[];
}

export interface LgStandingsView {
  blocks: LgBlock[];
  hasDivisions: boolean;
  /** Games played by all teams combined (wins + losses) — used to tell halves from the full season. */
  games: number;
}

const toInt = (v: unknown, dflt = 0): number => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : dflt;
};

function pctText(w: number, l: number, given: unknown): string {
  const g = typeof given === 'string' && /^\d?\.\d+$/.test(given.trim()) ? given.trim() : '';
  if (g) return g;
  if (w + l === 0) return '.000';
  const s = (w / (w + l)).toFixed(3);
  return s.startsWith('0') ? s.slice(1) : s;
}

const pctNum = (r: { wins: number; losses: number }) => (r.wins + r.losses ? r.wins / (r.wins + r.losses) : 0);

/** Games behind the leader, "—" when level or ahead (unequal games played can make it negative). */
export function gamesBack(leader: { wins: number; losses: number }, t: { wins: number; losses: number }): string {
  const gb = ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2;
  return gb > 0 ? gb.toFixed(1) : '—';
}

function abbrOf(team: any): string {
  const a = team?.abbreviation ?? team?.teamCode;
  if (a) return String(a).slice(0, 4).toUpperCase();
  const words = String(team?.name ?? team?.teamName ?? '?').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map(w => w[0]).join('') : (words[0] ?? '?')).slice(0, 3).toUpperCase();
}

interface Raw { tr: any; wins: number; losses: number }

function rawOf(tr: any): Raw {
  return { tr, wins: toInt(tr.wins), losses: toInt(tr.losses) };
}

/**
 * Best record first. Win % decides, so the table always agrees with the games-behind
 * column; the feed's own rank only breaks exact ties (it knows the tiebreakers).
 */
function order(rows: Raw[], rankKey: 'leagueRank' | 'divisionRank'): Raw[] {
  return rows.slice().sort((a, b) =>
    (pctNum(b) - pctNum(a)) ||
    (b.wins - a.wins) ||
    (toInt(a.tr[rankKey], 999) - toInt(b.tr[rankKey], 999)) ||
    (a.losses - b.losses));
}

function toRows(ordered: Raw[]): LgRow[] {
  const leader = ordered[0];
  return ordered.map((r, i) => ({
    teamId: r.tr.team?.id,
    teamName: r.tr.team?.name ?? 'Unknown',
    abbr: abbrOf(r.tr.team),
    wins: r.wins,
    losses: r.losses,
    pct: pctText(r.wins, r.losses, r.tr.winningPercentage),
    gb: i === 0 ? '—' : gamesBack(leader, r),
    rank: i + 1
  }));
}

/** "International League East" → "East" (kept whole when nothing would be left). */
export function shortDivisionName(division: string, league: string): string {
  const d = division.trim();
  const l = league.trim();
  if (l && d.toLowerCase().startsWith(l.toLowerCase())) {
    const rest = d.slice(l.length).trim();
    if (rest) return rest;
  }
  return d;
}

export function buildLgStandings(records: any[] | null | undefined): LgStandingsView {
  interface Acc { leagueId: number; name: string; teams: Raw[]; divs: Map<string, { id: number; name: string; teams: Raw[] }> }
  const leagues = new Map<string, Acc>();

  for (const rec of records ?? []) {
    const teams: any[] = rec.teamRecords ?? [];
    if (!teams.length) continue;
    const lid = toInt(rec.league?.id);
    const key = lid ? `id:${lid}` : `name:${rec.league?.name ?? ''}`;
    let acc = leagues.get(key);
    if (!acc) {
      acc = { leagueId: lid, name: rec.league?.name ?? 'League', teams: [], divs: new Map() };
      leagues.set(key, acc);
    }
    const divName: string | undefined = rec.division?.name;
    let div = divName ? acc.divs.get(divName) : undefined;
    if (divName && !div) { div = { id: toInt(rec.division?.id), name: divName, teams: [] }; acc.divs.set(divName, div); }

    const seen = new Set(acc.teams.map(r => r.tr.team?.id));
    for (const tr of teams) {
      const raw = rawOf(tr);
      if (!seen.has(tr.team?.id)) { acc.teams.push(raw); seen.add(tr.team?.id); }
      div?.teams.push(raw);
    }
  }

  let games = 0;
  const blocks: LgBlock[] = [];
  for (const acc of leagues.values()) {
    games += acc.teams.reduce((s, r) => s + r.wins + r.losses, 0);
    // A league whose only "division" is the league itself is a single table.
    const divisions: LgDivision[] = acc.divs.size >= 2
      ? [...acc.divs.values()]
          .map(d => ({
            id: d.id,
            name: d.name,
            short: shortDivisionName(d.name, acc.name),
            rows: toRows(order(d.teams, 'divisionRank'))
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    blocks.push({ leagueId: acc.leagueId, name: acc.name, table: toRows(order(acc.teams, 'leagueRank')), divisions });
  }
  blocks.sort((a, b) => a.name.localeCompare(b.name));

  return { blocks, hasDivisions: blocks.some(b => b.divisions.length > 0), games };
}
