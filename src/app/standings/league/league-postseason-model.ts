/**
 * Rebuilds a non-MLB league's postseason from its schedule.
 *
 * `v1/schedule/postseason/series` only ever returns MLB, so for every other league
 * the postseason games (game types F, D, L, W, P, C) are grouped back into rounds:
 *
 *   • a round whose teams each play ONE opponent is a knockout round: one series per
 *     pair of teams (best-of length from `gamesInSeries`, wins counted from the games);
 *   • a round in which a team meets several opponents is a round robin / pool play and
 *     becomes a table instead (LIDOM's Round Robin, LVBP's, the WBC's pools);
 *   • knockout series that share a team are linked into one bracket, so leagues that
 *     run several independent brackets (the minors: one per league) get one each.
 *
 * Nothing is league-specific: round names come from the feed's `seriesDescription`.
 */
import { gamesBack } from './league-standings-model';

export interface PsTeam { id: number; name: string; abbr: string }

export interface PsSeries {
  key: string;
  round: string;
  gameType: string;
  bestOf: number;
  /** The team that hosted game 1 (normally the better seed) first. */
  teams: [PsTeam, PsTeam];
  /** Series wins — or the runs scored when the "series" is a single game. */
  score: [number, number];
  scoreKind: 'wins' | 'runs';
  winner: 0 | 1 | null;
  status: 'upcoming' | 'live' | 'final';
  start: string;
  /** The games finished level (a split two-game round) and the winner is the team that went on to play in a later round. */
  advanced?: boolean;
  /** Wins a team starts the series with (NPB's Climax Series Final Stage: the league champion's advantage). Already included in `score`. */
  headStart?: [number, number];
}

export interface PsRound { name: string; series: PsSeries[] }

export interface PsBracket {
  /** Set only when the league runs more than one bracket (e.g. one per minor league). */
  title: string | null;
  rounds: PsRound[];
  champion: PsTeam | null;
}

export interface PsRobinRow {
  team: PsTeam; wins: number; losses: number; pct: string; gb: string; rank: number;
  /** The club went on to play in a later knockout round. */
  advances?: boolean;
}

export interface PsRobin {
  name: string;
  /** Set when a round robin is split into pools (WBC Pool A…). */
  pool: string | null;
  rows: PsRobinRow[];
  games: number;
  finished: number;
  /** Date (YYYY-MM-DD) of the first game. */
  start: string;
}

export interface PsView {
  robins: PsRobin[];
  brackets: PsBracket[];
  /** Some series or round-robin game is still to be played. */
  pending: boolean;
  games: number;
  /** Every club that played a postseason game (round robins included) — i.e. the clubs that qualified. */
  teams: PsTeam[];
  /** The winner of each bracket that has been decided (one per league when the minors run several brackets). */
  champions: PsTeam[];
}

const GAME_TYPE_NAME: Record<string, string> = {
  F: 'Wild Card', D: 'Division Series', L: 'League Championship', P: 'Playoffs', C: 'Championship', W: 'Finals'
};
const TYPE_RANK: Record<string, number> = { F: 0, D: 1, L: 2, P: 2, C: 3, W: 4 };
/** A last round that is named like a final is one even when the feed types it as an ordinary playoff game. */
const FINAL_ROUND = /\bchampionship\b|\bfinals?\b/i;

interface G {
  pk: number;
  date: string;
  type: string;
  desc: string;
  inSeries: number;
  state: 'Preview' | 'Live' | 'Final';
  home: PsTeam; away: PsTeam;
  homeRuns: number; awayRuns: number;
  winner: 'home' | 'away' | null;
  /** "Pool C" — the feed's own pool name on pool-play games (the WBC), or '' when it gives none. */
  pool: string;
}

const STATE_RANK = { Preview: 0, Live: 1, Final: 2 } as const;

function teamOf(side: any): PsTeam | null {
  const t = side?.team;
  if (!t?.id) return null;
  const name = String(t.name ?? t.teamName ?? 'Team');
  const words = name.split(/\s+/).filter(Boolean);
  const abbr = String(t.abbreviation ?? (words.length > 1 ? words.map(w => w[0]).join('') : name)).slice(0, 4).toUpperCase();
  return { id: t.id, name, abbr };
}

/** "Pool C" → "Pool C"; anything else (no description, "Game 7") → ''. */
function poolName(description: unknown): string {
  const m = /^pool\s+([A-Za-z0-9]+)$/i.exec(String(description ?? '').trim());
  return m ? `Pool ${m[1].toUpperCase()}` : '';
}

function parseGames(raw: any[]): G[] {
  const byPk = new Map<number, G>();
  for (const g of raw) {
    const home = teamOf(g?.teams?.home);
    const away = teamOf(g?.teams?.away);
    if (!home || !away || home.id === away.id) continue;
    if (/postponed|cancel/i.test(String(g.status?.detailedState ?? ''))) continue;

    const abstract = g.status?.abstractGameState;
    const state: G['state'] = abstract === 'Final' ? 'Final' : abstract === 'Live' ? 'Live' : 'Preview';
    const homeRuns = Number(g.teams.home.score ?? 0);
    const awayRuns = Number(g.teams.away.score ?? 0);
    let winner: G['winner'] = null;
    if (state === 'Final') {
      if (g.teams.home.isWinner) winner = 'home';
      else if (g.teams.away.isWinner) winner = 'away';
      else if (homeRuns !== awayRuns) winner = homeRuns > awayRuns ? 'home' : 'away';
    }
    const type = String(g.gameType ?? 'P');
    const parsed: G = {
      pk: g.gamePk ?? -(byPk.size + 1),
      date: String(g.officialDate ?? g.gameDate ?? '').slice(0, 10),
      type,
      desc: String(g.seriesDescription || GAME_TYPE_NAME[type] || 'Postseason'),
      inSeries: Number(g.gamesInSeries) || 0,
      state, home, away, homeRuns, awayRuns, winner,
      pool: poolName(g.description)
    };
    // a resumed or rescheduled game can appear twice — keep the most advanced copy
    const prev = byPk.get(parsed.pk);
    if (!prev || STATE_RANK[parsed.state] >= STATE_RANK[prev.state]) byPk.set(parsed.pk, parsed);
  }
  return [...byPk.values()];
}

/** "IL Championship Series" + "PCL Championship Series" → "IL / PCL Championship Series". */
function joinNames(a: string, b: string): string {
  const wa = a.split(/\s+/), wb = b.split(/\s+/);
  let k = 0;
  while (k < wa.length && k < wb.length && wa[wa.length - 1 - k] === wb[wb.length - 1 - k]) k++;
  if (k === 0 || k >= Math.min(wa.length, wb.length)) return `${a} / ${b}`;
  return `${wa.slice(0, wa.length - k).join(' ')} / ${wb.slice(0, wb.length - k).join(' ')} ${wa.slice(wa.length - k).join(' ')}`;
}

/** The most frequent non-empty value (ties → the first seen), or '' when there is none. */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = '', n = 0;
  for (const [v, c] of counts) if (c > n) { best = v; n = c; }
  return best;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const minStr = (xs: string[]) => xs.reduce((m, x) => (x && (!m || x < m) ? x : m), '');

/** Connected groups of ids, given edges between them. */
function components(edges: Array<[number, number]>): number[][] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const [a, b] of edges) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  const groups = new Map<number, number[]>();
  for (const id of parent.keys()) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  return [...groups.values()];
}

function makeSeries(desc: string, games: G[], bestOfOverride?: number): PsSeries {
  const sorted = games.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.pk - b.pk));
  const first = sorted[0];
  const t0 = first.home, t1 = first.away;                         // game 1's host listed first
  const bestOf = bestOfOverride ?? (Math.max(0, ...sorted.map(g => g.inSeries)) || sorted.length);
  const need = Math.floor(bestOf / 2) + 1;

  const wins: [number, number] = [0, 0];
  const runs: [number, number] = [0, 0];
  for (const g of sorted) {
    if (g.state !== 'Final') continue;
    const winTeam = g.winner === 'home' ? g.home : g.winner === 'away' ? g.away : null;
    if (winTeam) wins[winTeam.id === t0.id ? 0 : 1]++;
    runs[g.home.id === t0.id ? 0 : 1] += g.homeRuns;
    runs[g.home.id === t0.id ? 1 : 0] += g.awayRuns;
  }
  const single = bestOf === 1 && sorted.length === 1;
  const winner: 0 | 1 | null = wins[0] >= need ? 0 : wins[1] >= need ? 1 : null;
  const finals = sorted.filter(g => g.state === 'Final').length;
  const live = sorted.some(g => g.state === 'Live');
  const status: PsSeries['status'] =
    winner != null ? 'final'
    : live ? 'live'
    : finals === 0 ? 'upcoming'
    : finals === sorted.length && finals >= bestOf ? 'final'
    : 'live';

  const type = sorted.reduce((best, g) => (TYPE_RANK[g.type] ?? 2) > (TYPE_RANK[best] ?? 2) ? g.type : best, first.type);
  return {
    key: `${desc}|${pairKey(t0.id, t1.id)}`,
    round: desc,
    gameType: type,
    bestOf,
    teams: [t0, t1],
    score: single ? runs : wins,
    scoreKind: single ? 'runs' : 'wins',
    winner,
    status,
    start: first.date
  };
}

function makeRobin(desc: string, pool: string | null, games: G[]): PsRobin {
  const rows = new Map<number, { team: PsTeam; wins: number; losses: number }>();
  const row = (t: PsTeam) => { let r = rows.get(t.id); if (!r) { r = { team: t, wins: 0, losses: 0 }; rows.set(t.id, r); } return r; };
  let finished = 0;
  for (const g of games) {
    const h = row(g.home), a = row(g.away);
    if (g.state !== 'Final' || !g.winner) continue;
    finished++;
    if (g.winner === 'home') { h.wins++; a.losses++; } else { a.wins++; h.losses++; }
  }
  const pct = (r: { wins: number; losses: number }) => (r.wins + r.losses ? r.wins / (r.wins + r.losses) : 0);
  const ordered = [...rows.values()].sort((a, b) => (pct(b) - pct(a)) || (b.wins - a.wins) || a.team.name.localeCompare(b.team.name));
  return {
    name: desc,
    pool,
    games: games.length,
    finished,
    start: minStr(games.map(g => g.date)),
    rows: ordered.map((r, i) => {
      const p = r.wins + r.losses ? (r.wins / (r.wins + r.losses)).toFixed(3) : '0.000';
      return {
        team: r.team, wins: r.wins, losses: r.losses,
        pct: p.startsWith('0') ? p.slice(1) : p,
        gb: i === 0 ? '—' : gamesBack(ordered[0], r),
        rank: i + 1
      };
    })
  };
}

export function buildLeaguePostseason(rawGames: any[] | null | undefined): PsView {
  const games = parseGames(rawGames ?? []);
  const empty: PsView = { robins: [], brackets: [], pending: false, games: 0, teams: [], champions: [] };
  if (!games.length) return empty;

  const byDesc = new Map<string, G[]>();
  for (const g of games) byDesc.set(g.desc, [...(byDesc.get(g.desc) ?? []), g]);

  const robins: Array<{ rank: number; date: string; robin: PsRobin }> = [];
  const knockout: PsSeries[] = [];
  const seriesGames = new Map<string, G[]>();

  for (const [desc, gs] of byDesc) {
    const opponents = new Map<number, Set<number>>();
    const note = (a: number, b: number) => { (opponents.get(a) ?? opponents.set(a, new Set()).get(a)!).add(b); };
    for (const g of gs) { note(g.home.id, g.away.id); note(g.away.id, g.home.id); }
    const isRobin = [...opponents.values()].some(s => s.size > 1);

    if (isRobin) {
      const pools = components(gs.map(g => [g.home.id, g.away.id] as [number, number]));
      // The feed names the pools on the games themselves ("Pool C"): use those, because a made-up letter
      // would disagree with the tournament's own. Without names, fall back to letters in order of size.
      const groups = pools.map(ids => gs.filter(g => ids.includes(g.home.id)));
      const named = groups.map(pg => mostCommon(pg.map(g => g.pool)));
      const useNames = named.every(n => n) && new Set(named).size === named.length;
      const order = groups.map((pg, i) => ({ pg, name: named[i] }));
      if (useNames) order.sort((a, b) => a.name.localeCompare(b.name));
      else order.sort((a, b) => b.pg.length - a.pg.length || a.pg[0].home.name.localeCompare(b.pg[0].home.name));
      order.forEach(({ pg, name }, i) => {
        const label = pools.length > 1 ? (useNames ? name : `Pool ${String.fromCharCode(65 + i)}`) : (name || null);
        const robin = makeRobin(desc, label, pg);
        robins.push({ rank: Math.min(...pg.map(g => TYPE_RANK[g.type] ?? 2)), date: minStr(pg.map(g => g.date)), robin });
      });
    } else {
      const pairs = new Map<string, G[]>();
      for (const g of gs) pairs.set(pairKey(g.home.id, g.away.id), [...(pairs.get(pairKey(g.home.id, g.away.id)) ?? []), g]);
      for (const pg of pairs.values()) { const ser = makeSeries(desc, pg); knockout.push(ser); seriesGames.set(ser.key, pg); }
    }
  }

  // ── rounds, in playing order ──
  const roundInfo = new Map<string, { rank: number; date: string }>();
  for (const s of knockout) {
    const cur = roundInfo.get(s.round);
    roundInfo.set(s.round, {
      rank: Math.min(cur?.rank ?? 99, TYPE_RANK[s.gameType] ?? 2),
      date: minStr([s.start, cur?.date ?? ''])
    });
  }
  const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const roundOrder = [...roundInfo.entries()]
    .sort((a, b) => (a[1].rank - b[1].rank) || cmpStr(a[1].date, b[1].date) || a[0].localeCompare(b[0]))
    .map(([name]) => name);

  // ── one bracket per group of linked series ──
  const teamOfSeries = (s: PsSeries) => [s.teams[0].id, s.teams[1].id];
  const groups = components(knockout.map(s => [s.teams[0].id, s.teams[1].id] as [number, number]));
  const brackets: PsBracket[] = groups.map(ids => {
    const set = new Set(ids);
    const mine = knockout.filter(s => set.has(s.teams[0].id));
    const named: PsRound[] = roundOrder
      .map(name => ({ name, series: mine.filter(s => s.round === name) }))
      .filter(r => r.series.length);

    // Rounds that are really one stage played side by side — Triple-A's two league championship series, which the
    // feed names after their own leagues — share a column (same kind of game, same first day).
    const stage = (r: PsRound) => `${Math.max(...r.series.map(s => TYPE_RANK[s.gameType] ?? 2))}|${minStr(r.series.map(s => s.start))}`;
    const rounds: PsRound[] = [];
    for (const r of named) {
      const prev = rounds[rounds.length - 1];
      if (prev && stage(prev) === stage(r)) rounds[rounds.length - 1] = { name: joinNames(prev.name, r.name), series: [...prev.series, ...r.series] };
      else rounds.push({ name: r.name, series: r.series.slice() });
    }

    // order each round to line up with the series its teams advance into
    const byDate = (a: PsSeries, b: PsSeries) => cmpStr(a.start, b.start) || a.key.localeCompare(b.key);
    for (let i = rounds.length - 1; i >= 0; i--) {
      const next = rounds[i + 1];
      if (!next) { rounds[i].series.sort(byDate); continue; }
      const feeds = (s: PsSeries) => {
        const idx = next.series.findIndex(n => teamOfSeries(n).some(id => teamOfSeries(s).includes(id)));
        return idx < 0 ? 999 : idx;
      };
      rounds[i].series.sort((a, b) => (feeds(a) - feeds(b)) || byDate(a, b));
    }

    // Some feeds give a round's total game count as `gamesInSeries` (the WBC's four one-game quarterfinals
    // say "4"). Once a later round has begun, a round whose series all ended short of that count with no
    // winner was really made of shorter series — so settle them on the games actually played.
    for (let i = 0; i < rounds.length - 1; i++) {
      rounds[i].series = rounds[i].series.map(ser => {
        const gs = seriesGames.get(ser.key)!;
        return ser.winner == null && gs.length < ser.bestOf && gs.every(g => g.state === 'Final') ? makeSeries(ser.round, gs, gs.length) : ser;
      });
    }

    // A round that finished level (a split two-game round) has no winner of its own. If one of its teams then
    // turns up in a later round — or in a round robin that began after it — that team is the one that went through.
    for (let i = 0; i < rounds.length; i++) {
      const later = new Set<number>(rounds.slice(i + 1).flatMap(r => r.series.flatMap(teamOfSeries)));
      rounds[i].series = rounds[i].series.map(ser => {
        if (ser.winner != null || ser.status !== 'final') return ser;
        const through = ser.teams.map(t =>
          later.has(t.id) || robins.some(r => r.date >= ser.start && r.robin.rows.some(row => row.team.id === t.id)));
        if (through[0] === through[1]) return ser;
        return { ...ser, winner: through[0] ? 0 : 1, advanced: true };
      });
    }

    const last = rounds[rounds.length - 1];
    const finale = last && last.series.length === 1 && (['W', 'C'].includes(last.series[0].gameType) || FINAL_ROUND.test(last.series[0].round)) ? last.series[0] : null;
    const champion = finale && finale.winner != null ? finale.teams[finale.winner] : null;
    return { title: null, rounds, champion };
  });

  const startOf = (b: PsBracket) => minStr(b.rounds.flatMap(r => r.series.map(s => s.start)));
  brackets.sort((a, b) => cmpStr(startOf(a), startOf(b)));
  if (brackets.length > 1) {
    brackets.forEach(b => { b.title = b.rounds[b.rounds.length - 1].series.length === 1 ? b.rounds[b.rounds.length - 1].name : null; });
    brackets.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  }

  robins.sort((a, b) => (a.rank - b.rank) || cmpStr(a.date, b.date) || (a.robin.pool ?? '').localeCompare(b.robin.pool ?? ''));

  const pending =
    brackets.some(b => b.rounds.some(r => r.series.some(s => s.status !== 'final'))) ||
    robins.some(r => r.robin.finished < r.robin.games);

  // In a round robin or pool, mark the clubs that then played in a later knockout series.
  for (const r of robins) {
    const onward = new Set<number>();
    for (const b of brackets) for (const rd of b.rounds) for (const s of rd.series) {
      if (s.start >= r.robin.start) s.teams.forEach(t => onward.add(t.id));
    }
    r.robin.rows.forEach(row => { if (onward.has(row.team.id)) row.advances = true; });
  }

  const teamsById = new Map<number, PsTeam>();
  for (const g of games) { teamsById.set(g.home.id, g.home); teamsById.set(g.away.id, g.away); }

  return {
    robins: robins.map(r => r.robin),
    brackets,
    pending,
    games: games.length,
    teams: [...teamsById.values()].sort((a, b) => a.name.localeCompare(b.name)),
    champions: brackets.map(b => b.champion).filter((t): t is PsTeam => !!t)
  };
}
