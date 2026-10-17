/**
 * Turns MLB's postseason series feed (`schedule/postseason/series`) into a
 * bracket tree. Pure functions only — no Angular, no HTTP — so every era can be
 * unit-tested.
 *
 * What the feed gives us (verified against the live API for 1919 → 2026):
 *   - one entry per series, `series.id` like `F_1`, `D_2`, `L_1`, `W_1`
 *     (F = Wild Card, D = Division Series, L = League Championship, W = World Series)
 *   - games with scores, `gamesInSeries` (the "best of"), `seriesDescription`
 *     ("AL Wild Card Series (3 vs. 6)", "NLDS 'A' …", "World Series")
 *   - no seeds, no league field and no series winner — those are derived here.
 *   - undecided slots appear as placeholder teams ("AL Champion", id 21).
 *
 * The tree is wired from who actually played whom (team membership), so it is
 * right for whatever shape a season had. Only the current 12-team format is also
 * filled in from a template, so an in-progress postseason still shows TBD boxes.
 */
import { FormatKind, SeasonFormat, formatForSeason } from './postseason-formats';

export type League = 'AL' | 'NL';
export type Round = 'F' | 'D' | 'L' | 'W';

export interface BTeam {
  id: number;
  name: string;
  abbr: string;
  color: string;
  /** Logo URL, or null when the club played under a different identity that year (shown as initials). */
  logo: string | null;
  clickable: boolean;
}

export type SlotState = 'won' | 'lost' | 'open';

export interface BSlot {
  team: BTeam | null;
  /** Text for an undecided slot, e.g. "Winner 3/6". */
  label: string;
  /** Seed badge shown where the team enters the bracket: '' | '1'…'8' | 'WC'. */
  seed: string;
  state: SlotState;
  wins: number | null;
}

export type NodeState = 'final' | 'live' | 'upcoming' | 'tbd';

export interface BNode {
  key: string;
  round: Round;
  league: League | null;
  bestOf: number;
  /** [top, bottom] as drawn. */
  slots: [BSlot, BSlot];
  /** Earlier series whose winner fills slot 0 / slot 1 (null = the team enters here). */
  feeders: [BNode | null, BNode | null];
  winner: 0 | 1 | null;
  state: NodeState;
  /** "CWS wins 2-0", "MIL leads 2-0", "Series tied 1-1", "Starts Oct 17" … */
  statusText: string;
}

export interface BColumn {
  round: Round;
  title: string;
  sub: string;
  bestOf: number;
}

export interface BracketModel {
  season: number;
  kind: FormatKind;
  format: SeasonFormat;
  /** True when built from current standings rather than from scheduled series. */
  projected: boolean;
  roots: { AL: BNode | null; NL: BNode | null; WS: BNode | null };
  /** Round columns per league, outermost (first round) → innermost (LCS). */
  columns: Record<League, BColumn[]>;
}

export interface RawSeries {
  series?: { id?: string; gameType?: string };
  games?: any[];
}

export interface TeamInfo {
  league: League | null;
  divisionRank: number;
  pct: number;
}

export interface ProjectedSeeds { AL: BTeam[]; NL: BTeam[]; }

export type TeamResolver = (id: number, name: string) => BTeam;

export interface TeamLookup {
  color(id: number): string;
  abbr(id: number): string;
  logo(id: number): string;
  name(id: number): string;
}

export interface BuildInput {
  season: number;
  series: RawSeries[] | null | undefined;
  info: ReadonlyMap<number, TeamInfo>;
  resolve: TeamResolver;
  projected?: ProjectedSeeds | null;
}

/* ───────────────────────── teams ───────────────────────── */

const HISTORICAL_ABBR: Record<string, string> = {
  'Brooklyn Dodgers': 'BKN', 'Brooklyn Robins': 'BKN', 'Brooklyn Superbas': 'BKN',
  'New York Giants': 'NYG', 'Boston Braves': 'BSN', 'Boston Beaneaters': 'BSN', 'Boston Rustlers': 'BSN',
  'Milwaukee Braves': 'MLN', 'Philadelphia Athletics': 'PHA', 'Kansas City Athletics': 'KCA',
  'Oakland Athletics': 'OAK', 'St. Louis Browns': 'SLB', 'Washington Senators': 'WAS',
  'Boston Americans': 'BOS', 'Cleveland Indians': 'CLE', 'Cleveland Naps': 'CLE',
  'Montreal Expos': 'MON', 'California Angels': 'CAL', 'Anaheim Angels': 'ANA',
  'Los Angeles Angels of Anaheim': 'LAA', 'Florida Marlins': 'FLA', 'Tampa Bay Devil Rays': 'TB',
  'Pittsburg Pirates': 'PIT', 'Cincinnati Redlegs': 'CIN', 'Chicago Orphans': 'CHC',
  'Houston Colt .45s': 'HOU', 'Seattle Pilots': 'SEA', 'Minnesota Twins': 'MIN'
};

function norm(s: string): string { return (s || '').trim().toLowerCase(); }

function deriveAbbr(name: string): string {
  const letters = (name || '').replace(/[^A-Za-z ]/g, '').trim();
  const words = letters.split(/\s+/).filter(Boolean);
  const initials = words.map(w => w[0]).join('').toUpperCase();
  return (initials.length >= 3 ? initials.slice(0, 3) : letters.replace(/\s/g, '').slice(0, 3).toUpperCase()) || 'MLB';
}

/**
 * Resolves a team id + the name it carried *that season* to display data.
 * The current logo is only used when the club had the same name then (so the
 * 1955 Brooklyn Dodgers or 2005 Montreal-era franchises show an initials tile
 * instead of an anachronistic logo).
 */
export function makeTeamResolver(lookup: TeamLookup): TeamResolver {
  return (id: number, name: string): BTeam => {
    const current = lookup.name(id);
    const same = !!current && (norm(name) === norm(current) || (id === 133 && /^(oakland )?athletics$/i.test((name || '').trim())));
    const abbr = same ? lookup.abbr(id) : (HISTORICAL_ABBR[name] ?? deriveAbbr(name));
    return {
      id,
      name: name || current || 'Unknown',
      abbr,
      color: lookup.color(id),
      logo: same ? lookup.logo(id) : null,
      clickable: !!current
    };
  };
}

const PLACEHOLDER_RE = /\b(winner|champion|wild\s*card|tbd|seed)\b/i;

/** Undecided slots in the feed use fake teams like "AL Champion" (id 21). */
export function isPlaceholderTeam(id: number | undefined, name: string | undefined): boolean {
  return !id || id < 100 || PLACEHOLDER_RE.test(name || '');
}

/* ───────────────────────── series drafts ───────────────────────── */

interface Draft {
  id: string;
  num: number;
  round: Round;
  league: League | null;
  desc: string;
  bestOf: number;
  names: Map<number, string>;
  awayId: number;
  homeId: number;
  awayLabel: string;
  homeLabel: string;
  wins: Map<number, number>;
  playedCount: number;
  winnerId: number | null;
  live: boolean;
  startDate: string;
  /** [winner's runs, loser's runs] of the last game — used for one-game series. */
  lastScore: [number, number] | null;
}

const DEFAULT_BEST_OF: Record<Round, number> = { F: 3, D: 5, L: 7, W: 7 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : '';
}

function leagueOfText(text: string): League | null {
  const m = /\b(AL|NL|ALDS|NLDS|ALCS|NLCS|American League|National League)\b/i.exec(text || '');
  if (!m) return null;
  return m[1].toUpperCase().startsWith('A') ? 'AL' : 'NL';
}

const isFinal = (g: any) =>
  g?.status?.abstractGameState === 'Final' &&
  g?.teams?.home?.score != null && g?.teams?.away?.score != null &&
  !/postponed|cancel|suspend/i.test(g?.status?.detailedState || '');

const isLive = (g: any) => g?.status?.abstractGameState === 'Live';

function toDraft(raw: RawSeries, info: ReadonlyMap<number, TeamInfo>): Draft | null {
  const idStr = raw?.series?.id ?? '';
  const m = /^([FDLW])_(\d+)/.exec(idStr);
  const gt = (raw?.series?.gameType ?? '') as string;
  const round = (m ? m[1] : gt) as Round;
  if (!['F', 'D', 'L', 'W'].includes(round)) return null;

  // The feed can list a rained-out game twice (Postponed + the makeup) — keep one per gamePk.
  const byPk = new Map<number, any>();
  for (const g of raw.games ?? []) {
    const prev = byPk.get(g?.gamePk);
    if (!prev || (isFinal(g) && !isFinal(prev))) byPk.set(g?.gamePk, g);
  }
  const games = [...byPk.values()].sort((a, b) =>
    String(a?.gameDate ?? '').localeCompare(String(b?.gameDate ?? '')) || (a?.gameNumber ?? 0) - (b?.gameNumber ?? 0));
  if (!games.length) return null;

  const names = new Map<number, string>();
  for (const g of games) {
    for (const side of ['away', 'home'] as const) {
      const t = g?.teams?.[side]?.team;
      if (t && !isPlaceholderTeam(t.id, t.name) && !names.has(t.id)) names.set(t.id, t.name);
    }
  }

  const first = games[0];
  const realId = (side: 'away' | 'home'): number => {
    const t = first?.teams?.[side]?.team;
    return t && !isPlaceholderTeam(t.id, t.name) ? t.id : 0;
  };
  const label = (side: 'away' | 'home'): string => first?.teams?.[side]?.team?.name || 'TBD';

  const bestOf = Math.max(0, ...games.map(g => Number(g?.gamesInSeries) || 0)) || DEFAULT_BEST_OF[round];
  const need = Math.floor(bestOf / 2) + 1;

  const wins = new Map<number, number>();
  let playedCount = 0;
  let lastScore: [number, number] | null = null;
  for (const g of games.filter(isFinal)) {
    const h = g.teams.home, a = g.teams.away;
    const homeWon = h.isWinner === true ? true : a.isWinner === true ? false : Number(h.score) > Number(a.score);
    const winSide = homeWon ? h : a;
    const loseSide = homeWon ? a : h;
    const id = winSide?.team?.id;
    if (id) wins.set(id, (wins.get(id) ?? 0) + 1);
    playedCount++;
    lastScore = [Number(winSide.score), Number(loseSide.score)];
  }
  let winnerId: number | null = null;
  for (const [id, w] of wins) if (w >= need) winnerId = id;

  const desc: string = first?.seriesDescription || '';
  let league = leagueOfText(desc);
  if (!league && round !== 'W') {
    const ls = new Set([...names.keys()].map(id => info.get(id)?.league).filter(Boolean));
    if (ls.size === 1) league = [...ls][0] as League;
  }

  return {
    id: idStr || `${round}_?`,
    num: m ? Number(m[2]) : 0,
    round,
    league: round === 'W' ? null : league,
    desc,
    bestOf,
    names,
    awayId: realId('away'),
    homeId: realId('home'),
    awayLabel: label('away'),
    homeLabel: label('home'),
    wins,
    playedCount,
    winnerId,
    live: games.some(isLive),
    startDate: first?.officialDate || String(first?.gameDate ?? '').slice(0, 10),
    lastScore
  };
}

/* ───────────────────────── nodes ───────────────────────── */

function tbdSlot(label: string): BSlot {
  return { team: null, label, seed: '', state: 'open', wins: null };
}

function teamSlot(team: BTeam, seed = ''): BSlot {
  return { team, label: '', seed, state: 'open', wins: null };
}

function refreshWinner(n: BNode): void {
  n.winner = n.slots[0].state === 'won' ? 0 : n.slots[1].state === 'won' ? 1 : null;
}

function nodeFromDraft(d: Draft, resolve: TeamResolver): BNode {
  const mk = (id: number, ph: string): BSlot => {
    if (!id) return tbdSlot(ph);
    const team = resolve(id, d.names.get(id) ?? '');
    return {
      team, label: '', seed: '',
      state: d.winnerId == null ? 'open' : d.winnerId === id ? 'won' : 'lost',
      wins: d.wins.get(id) ?? 0
    };
  };
  const slots: [BSlot, BSlot] = [mk(d.awayId, d.awayLabel), mk(d.homeId, d.homeLabel)];

  let state: NodeState;
  let statusText = '';
  const a = slots[0], b = slots[1];
  if (d.winnerId != null) {
    state = 'final';
    const w = a.state === 'won' ? a : b;
    const l = w === a ? b : a;
    statusText = d.bestOf === 1 && d.lastScore
      ? `${w.team?.abbr} wins ${d.lastScore[0]}-${d.lastScore[1]}`
      : `${w.team?.abbr} wins ${w.wins}-${l.wins}`;
  } else if (d.playedCount > 0 || d.live) {
    state = 'live';
    const aw = a.wins ?? 0, bw = b.wins ?? 0;
    if (d.bestOf === 1) statusText = 'In progress';
    else if (aw === bw) statusText = aw === 0 ? 'In progress' : `Series tied ${aw}-${bw}`;
    else {
      const lead = aw > bw ? a : b;
      statusText = `${lead.team?.abbr} leads ${Math.max(aw, bw)}-${Math.min(aw, bw)}`;
    }
  } else if (a.team || b.team) {
    state = 'upcoming';
    statusText = d.startDate ? `Starts ${fmtDate(d.startDate)}` : '';
  } else {
    state = 'tbd';
  }

  const n: BNode = {
    key: d.id, round: d.round, league: d.league, bestOf: d.bestOf,
    slots, feeders: [null, null], winner: null, state, statusText
  };
  refreshWinner(n);
  return n;
}

function synthNode(key: string, round: Round, league: League | null, labels: [string, string], teams?: [BTeam | null, BTeam | null]): BNode {
  const slot = (i: 0 | 1): BSlot => (teams && teams[i]) ? teamSlot(teams[i]!) : tbdSlot(labels[i]);
  return {
    key, round, league, bestOf: DEFAULT_BEST_OF[round],
    slots: [slot(0), slot(1)], feeders: [null, null], winner: null,
    state: (teams && (teams[0] || teams[1])) ? 'upcoming' : 'tbd', statusText: ''
  };
}

/** Puts each team in the slot of the series it came from, and fills undecided slots from decided feeders. */
function wire(parent: BNode, f0: BNode | null, f1: BNode | null): void {
  parent.feeders = [f0, f1];
  const from = (s: BSlot, f: BNode | null) => !!(s.team && f && f.slots.some(x => x.team?.id === s.team!.id));
  let s = parent.slots;
  const straight = Number(from(s[0], f0)) + Number(from(s[1], f1));
  const crossed = Number(from(s[1], f0)) + Number(from(s[0], f1));
  if (crossed > straight) s = [s[1], s[0]];
  else if (crossed === straight && f0 && !f1 && s[0].team && !s[1].team) s = [s[1], s[0]];
  parent.slots = s;
  ([f0, f1] as (BNode | null)[]).forEach((f, i) => {
    const slot = parent.slots[i];
    if (f && !slot.team && f.winner != null) {
      const t = f.slots[f.winner].team;
      if (t) { slot.team = t; slot.label = ''; }
    }
  });
  refreshWinner(parent);
}

/* ───────────────────────── per-format assembly ───────────────────────── */

interface Ctx {
  season: number;
  drafts: Draft[];
  info: ReadonlyMap<number, TeamInfo>;
  resolve: TeamResolver;
  projected: ProjectedSeeds | null;
}

const byNum = (a: Draft, b: Draft) => a.num - b.num;
const inLeague = (c: Ctx, L: League, r: Round) => c.drafts.filter(d => d.round === r && d.league === L).sort(byNum);
const touches = (d: Draft | null | undefined, f: Draft | null | undefined): boolean =>
  !!(d && f && [...f.names.keys()].some(id => d.names.has(id)));

function pairOf(d: Draft, idx: number, defaults: [number, number][]): [number, number] {
  const m = /\b(\d)\s*(?:vs\.?|v\.?)\s*(\d)\b/i.exec(d.desc);
  if (m) { const x = Number(m[1]), y = Number(m[2]); return [Math.min(x, y), Math.max(x, y)]; }
  return defaults[Math.min(idx, defaults.length - 1)];
}

/** First-round node: road team on top, home (higher seed) on the bottom, seeds on both. */
function firstRoundNode(c: Ctx, d: Draft | null, key: string, L: League, hi: number, lo: number): BNode {
  if (d) {
    const n = nodeFromDraft(d, c.resolve);
    n.slots[0].seed = String(lo);
    n.slots[1].seed = String(hi);
    return n;
  }
  const p = c.projected?.[L];
  const t = (seed: number) => p?.[seed - 1] ?? null;
  const n = synthNode(key, 'F', L, [`Seed ${lo}`, `Seed ${hi}`], [t(lo), t(hi)]);
  if (n.slots[0].team) n.slots[0].seed = String(lo);
  if (n.slots[1].team) n.slots[1].seed = String(hi);
  return n;
}

function fillEntry(c: Ctx, n: BNode, idx: 0 | 1, L: League, seed: number): void {
  const slot = n.slots[idx];
  if (!slot.team) {
    const t = c.projected?.[L]?.[seed - 1];
    if (t) { slot.team = t; slot.label = ''; } else slot.label = `Seed ${seed}`;
  }
  if (slot.team) slot.seed = String(seed);
}

/** 2022 →: 3 division winners + 3 Wild Cards; seeds 1 and 2 bye; fixed bracket. */
function buildSix(c: Ctx, L: League): BNode {
  const fs = inLeague(c, L, 'F');
  const ds = inLeague(c, L, 'D');
  const ls = inLeague(c, L, 'L');
  const defaults: [number, number][] = [[3, 6], [4, 5]];

  let d36: Draft | null = null, d45: Draft | null = null;
  for (let i = 0; i < fs.length; i++) {
    const p = pairOf(fs[i], i, defaults);
    if (p[0] === 3 && !d36) d36 = fs[i]; else if (p[0] === 4 && !d45) d45 = fs[i];
  }
  const leftover = fs.filter(d => d !== d36 && d !== d45);
  if (!d36 && leftover.length) d36 = leftover.shift() ?? null;
  if (!d45 && leftover.length) d45 = leftover.shift() ?? null;

  const n36 = firstRoundNode(c, d36, `${L}-WC-3v6`, L, 3, 6);
  const n45 = firstRoundNode(c, d45, `${L}-WC-4v5`, L, 4, 5);

  // Which Division Series is the No.1 seed's (plays the 4/5 winner) — by who played whom, else by series number.
  let dS1: Draft | null = ds.find(d => touches(d, d45)) ?? null;
  let dS2: Draft | null = ds.find(d => d !== dS1 && touches(d, d36)) ?? null;
  const rest = ds.filter(d => d !== dS1 && d !== dS2);
  if (!dS1 && !dS2) { dS1 = rest[0] ?? null; dS2 = rest[1] ?? null; }
  else if (!dS1) dS1 = rest[0] ?? null;
  else if (!dS2) dS2 = rest[0] ?? null;

  const dNode = (d: Draft | null, key: string, feeder: BNode, seed: 1 | 2, pair: string): BNode => {
    const n = d ? nodeFromDraft(d, c.resolve) : synthNode(key, 'D', L, [`Winner ${pair}`, `Seed ${seed}`]);
    wire(n, feeder, null);
    if (!n.slots[0].team) n.slots[0].label = `Winner ${pair}`;
    fillEntry(c, n, 1, L, seed);
    return n;
  };
  const nS1 = dNode(dS1, `${L}-DS-1`, n45, 1, '4/5');
  const nS2 = dNode(dS2, `${L}-DS-2`, n36, 2, '3/6');

  // As in MLB's graphic: the No.2 seed's half is on top, the No.1 seed's half below.
  const root = ls[0] ? nodeFromDraft(ls[0], c.resolve) : synthNode(`${L}-CS`, 'L', L, [`${L}DS winner`, `${L}DS winner`]);
  wire(root, nS2, nS1);
  root.slots.forEach(s => { if (!s.team) s.label = `${L}DS winner`; });
  return root;
}

/** 2020: 8 teams per league, best-of-3 Wild Card Series, no byes — 1v8 & 4v5 meet, 2v7 & 3v6 meet. */
function buildEight(c: Ctx, L: League): BNode {
  const fs = inLeague(c, L, 'F');
  const ds = inLeague(c, L, 'D');
  const ls = inLeague(c, L, 'L');
  const defaults: [number, number][] = [[1, 8], [2, 7], [3, 6], [4, 5]];

  const byHi = new Map<number, Draft>();
  fs.forEach((d, i) => { const hi = pairOf(d, i, defaults)[0]; if (!byHi.has(hi)) byHi.set(hi, d); });
  const f: BNode[] = defaults.map(([hi, lo]) => firstRoundNode(c, byHi.get(hi) ?? null, `${L}-WC-${hi}v${lo}`, L, hi, lo));
  // classic bracket order: 1v8, 4v5 on top; 3v6, 2v7 below
  const topPair: [BNode, BNode] = [f[0], f[3]];
  const botPair: [BNode, BNode] = [f[2], f[1]];
  const draftFor = (pair: [BNode, BNode]): Draft | null =>
    ds.find(d => pair.some(n => n.slots.some(s => s.team && d.names.has(s.team.id)))) ?? null;
  let dTop = draftFor(topPair);
  let dBot = draftFor(botPair);
  if (dBot === dTop) dBot = null;
  const rest = ds.filter(d => d !== dTop && d !== dBot);
  if (!dTop) dTop = rest.shift() ?? null;
  if (!dBot) dBot = rest.shift() ?? null;

  const dNode = (d: Draft | null, key: string, pair: [BNode, BNode], labels: [string, string]): BNode => {
    const n = d ? nodeFromDraft(d, c.resolve) : synthNode(key, 'D', L, labels);
    wire(n, pair[0], pair[1]);
    n.slots.forEach((s, i) => { if (!s.team) s.label = labels[i]; });
    return n;
  };
  const nTop = dNode(dTop, `${L}-DS-A`, topPair, ['Winner 1/8', 'Winner 4/5']);
  const nBot = dNode(dBot, `${L}-DS-B`, botPair, ['Winner 3/6', 'Winner 2/7']);

  const root = ls[0] ? nodeFromDraft(ls[0], c.resolve) : synthNode(`${L}-CS`, 'L', L, [`${L}DS winner`, `${L}DS winner`]);
  wire(root, nTop, nBot);
  root.slots.forEach(s => { if (!s.team) s.label = `${L}DS winner`; });
  return root;
}

/** 2012–2019 and 2021: one-game Wild Card; division winners seeded 1–3 by record. */
function buildWildCardGame(c: Ctx, L: League): BNode {
  const f = inLeague(c, L, 'F')[0] ?? null;
  const ds = inLeague(c, L, 'D');
  const ls = inLeague(c, L, 'L');

  const nF = firstRoundNode(c, f, `${L}-WC`, L, 4, 5);
  const dWc = ds.find(d => touches(d, f)) ?? ds.find(d => [...d.names.keys()].length < 2) ?? (ds.length > 1 ? ds[1] : null);
  const dOther = ds.find(d => d !== dWc) ?? null;

  const nWc = dWc ? nodeFromDraft(dWc, c.resolve) : synthNode(`${L}-DS-WC`, 'D', L, ['Wild Card winner', 'Seed 1']);
  wire(nWc, nF, null);
  if (!nWc.slots[0].team) nWc.slots[0].label = 'Wild Card winner';
  const nOther = dOther ? nodeFromDraft(dOther, c.resolve) : synthNode(`${L}-DS-A`, 'D', L, ['Seed 3', 'Seed 2']);

  // Seeds 1–3: the three division winners ordered by record.
  const entries: BSlot[] = [nOther.slots[0], nOther.slots[1], nWc.slots[1]].filter(s => !!s.team);
  if (entries.length === 3 && entries.every(s => c.info.has(s.team!.id))) {
    [...entries]
      .sort((x, y) => (c.info.get(y.team!.id)!.pct - c.info.get(x.team!.id)!.pct))
      .forEach((s, i) => { s.seed = String(i + 1); });
  }

  const root = ls[0] ? nodeFromDraft(ls[0], c.resolve) : synthNode(`${L}-CS`, 'L', L, [`${L}DS winner`, `${L}DS winner`]);
  wire(root, nOther, nWc);
  root.slots.forEach(s => { if (!s.team) s.label = `${L}DS winner`; });
  return root;
}

/** 1981 and 1995–2011: two Division Series per league (every team enters there). */
function buildDivision(c: Ctx, L: League): BNode {
  const ds = inLeague(c, L, 'D');
  const ls = inLeague(c, L, 'L');
  const wcTags = c.season >= 1995 && c.season !== 1981;

  const nodes = ds.slice(0, 2).map(d => {
    const n = nodeFromDraft(d, c.resolve);
    if (wcTags) {
      n.slots.forEach(s => {
        const i = s.team ? c.info.get(s.team.id) : undefined;
        if (i && i.divisionRank > 1) s.seed = 'WC';
      });
    }
    return n;
  });
  const root = ls[0] ? nodeFromDraft(ls[0], c.resolve) : synthNode(`${L}-CS`, 'L', L, [`${L}DS winner`, `${L}DS winner`]);
  wire(root, nodes[0] ?? null, nodes[1] ?? null);
  root.slots.forEach(s => { if (!s.team) s.label = `${L}DS winner`; });
  return root;
}

/** 1969–1993: the two division winners meet in the LCS. */
function buildChampionship(c: Ctx, L: League): BNode | null {
  const l = inLeague(c, L, 'L')[0];
  return l ? nodeFromDraft(l, c.resolve) : null;
}

function buildWorldSeries(c: Ctx, al: BNode | null, nl: BNode | null): BNode | null {
  const d = c.drafts.find(x => x.round === 'W') ?? null;
  if (!d && !al && !nl) return null;
  const n = d ? nodeFromDraft(d, c.resolve) : synthNode('W_1', 'W', null, ['AL Champion', 'NL Champion']);
  if (al || nl) {
    wire(n, al, nl);
  } else {
    // No league trees (pre-1969): AL pennant winner on the left.
    const lg = (s: BSlot) => (s.team ? c.info.get(s.team.id)?.league ?? null : null);
    if (lg(n.slots[0]) === 'NL' || lg(n.slots[1]) === 'AL') {
      n.slots = [n.slots[1], n.slots[0]];
      refreshWinner(n);
    }
  }
  n.slots.forEach((s, i) => { if (!s.team) s.label = i === 0 ? 'AL Champion' : 'NL Champion'; });
  return n;
}

/* ───────────────────────── public API ───────────────────────── */

function inferKind(drafts: Draft[], expected: FormatKind): FormatKind {
  if (!drafts.length) return expected;
  const fMax = Math.max(0, ...(['AL', 'NL'] as League[]).map(l => drafts.filter(d => d.round === 'F' && d.league === l).length));
  if (drafts.some(d => d.round === 'F')) {
    if (fMax >= 4 || expected === 'wc8') return 'wc8';
    if (fMax >= 2 || expected === 'wc6') return 'wc6';
    return 'wcgame';
  }
  if (drafts.some(d => d.round === 'D')) return 'ds';
  if (drafts.some(d => d.round === 'L')) return 'lcs';
  return 'ws';
}

const LEAGUE_NAME: Record<League, string> = { AL: 'American League', NL: 'National League' };

export function collectNodes(root: BNode | null): BNode[] {
  if (!root) return [];
  const out: BNode[] = [];
  const seen = new Set<BNode>();
  const walk = (n: BNode | null) => {
    if (!n || seen.has(n)) return;
    seen.add(n);
    n.feeders.forEach(walk);
    out.push(n);
  };
  walk(root);
  return out;
}

function columnsFor(kind: FormatKind, L: League, root: BNode | null): BColumn[] {
  const rounds: Round[] =
    kind === 'wc6' || kind === 'wc8' || kind === 'wcgame' ? ['F', 'D', 'L'] :
    kind === 'ds' ? ['D', 'L'] :
    kind === 'lcs' ? ['L'] : [];
  const nodes = collectNodes(root);
  return rounds.map((round): BColumn => {
    const bestOf = Math.max(0, ...nodes.filter(n => n.round === round).map(n => n.bestOf)) ||
      (round === 'F' ? (kind === 'wcgame' ? 1 : 3) : DEFAULT_BEST_OF[round]);
    if (round === 'F') {
      return { round, title: kind === 'wcgame' ? 'WILD CARD GAME' : 'WILD CARD', sub: LEAGUE_NAME[L].toUpperCase(), bestOf };
    }
    if (round === 'D') return { round, title: `${L}DS`, sub: 'DIVISION SERIES', bestOf };
    return { round, title: `${L}CS`, sub: 'CHAMPIONSHIP SERIES', bestOf };
  });
}

function emptyModel(season: number, fmt: SeasonFormat, headline?: string, note?: string): BracketModel {
  return {
    season, kind: 'none',
    format: { kind: 'none', headline: headline ?? fmt.headline, note: note ?? fmt.note },
    projected: false,
    roots: { AL: null, NL: null, WS: null },
    columns: { AL: [], NL: [] }
  };
}

export function buildBracket(inp: BuildInput): BracketModel {
  const { season, info, resolve } = inp;
  const fmt = formatForSeason(season);
  const projected = inp.projected && inp.projected.AL.length >= 6 && inp.projected.NL.length >= 6 ? inp.projected : null;

  const drafts = (inp.series ?? [])
    .map(s => toDraft(s, info))
    .filter((d): d is Draft => !!d);

  let isProjection = false;
  if (!drafts.length) {
    if (fmt.kind === 'none') return emptyModel(season, fmt);
    if (!(fmt.kind === 'wc6' && projected)) {
      return emptyModel(season, fmt,
        'Postseason not available',
        `No ${season} postseason series were found yet. The bracket appears here once the field is set.`);
    }
    isProjection = true;
  }

  const kind: FormatKind = isProjection ? 'wc6' : inferKind(drafts, fmt.kind);
  const c: Ctx = { season, drafts, info, resolve, projected };

  let al: BNode | null = null, nl: BNode | null = null;
  const build = (L: League): BNode | null => {
    switch (kind) {
      case 'wc6': return buildSix(c, L);
      case 'wc8': return buildEight(c, L);
      case 'wcgame': return buildWildCardGame(c, L);
      case 'ds': return buildDivision(c, L);
      case 'lcs': return buildChampionship(c, L);
      default: return null;
    }
  };
  if (kind !== 'ws') { al = build('AL'); nl = build('NL'); }
  const ws = buildWorldSeries(c, al, nl);

  // Prefer the era's own wording; fall back to the generic one if the data shows a different shape.
  const format: SeasonFormat = fmt.kind === kind || fmt.kind === 'none'
    ? { ...fmt, kind }
    : { ...formatForSeason(kind === 'wc6' ? 2022 : kind === 'wc8' ? 2020 : kind === 'wcgame' ? 2015 : kind === 'ds' ? 2000 : kind === 'lcs' ? 1975 : 1950), kind };

  return {
    season, kind, format, projected: isProjection,
    roots: { AL: al, NL: nl, WS: ws },
    columns: { AL: columnsFor(kind, 'AL', al), NL: columnsFor(kind, 'NL', nl) }
  };
}
