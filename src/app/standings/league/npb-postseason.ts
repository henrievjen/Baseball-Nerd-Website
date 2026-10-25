/**
 * NPB postseason (Climax Series + Japan Series) for the Standings page.
 *
 * The NPB data set (shared/npb-data.ts) holds regular-season games only, and the MLB Stats API has
 * nothing for NPB, so there is no live feed for the postseason. Instead:
 *
 *   • NPB_POSTSEASON holds the series results, entered by hand (from npb.jp / Wikipedia) with the date
 *     they were last updated. Only game wins are stored — a series is "decided" when a club's wins plus
 *     any head start reach a majority of the series, and the status follows from that.
 *   • For the current season with no entry yet, a projection is drawn from the live standings (top
 *     three in each league → First Stage 2nd vs 3rd, Final Stage 1st vs the winner, Japan Series).
 *
 * Both produce the same PsView the other leagues' postseasons use, so one board draws them all.
 */
import { PsBracket, PsSeries, PsTeam, PsView } from './league-postseason-model';
import { LgBlock, LgStandingsView } from './league-standings-model';

/** The twelve clubs, with the ids the NPB data set (and so the standings tables) use. */
export const NPB_TEAMS: Record<string, PsTeam> = {
  YOM: { id: 3001, name: 'Yomiuri Giants', abbr: 'YOM' },
  HAN: { id: 3002, name: 'Hanshin Tigers', abbr: 'HAN' },
  DENA: { id: 3003, name: 'Yokohama DeNA BayStars', abbr: 'DENA' },
  HIR: { id: 3004, name: 'Hiroshima Toyo Carp', abbr: 'HIR' },
  CHU: { id: 3005, name: 'Chunichi Dragons', abbr: 'CHU' },
  YAK: { id: 3006, name: 'Tokyo Yakult Swallows', abbr: 'YAK' },
  SBH: { id: 3007, name: 'Fukuoka SoftBank Hawks', abbr: 'SBH' },
  NHF: { id: 3008, name: 'Hokkaido Nippon-Ham Fighters', abbr: 'NHF' },
  LOT: { id: 3009, name: 'Chiba Lotte Marines', abbr: 'LOT' },
  RAK: { id: 3010, name: 'Tohoku Rakuten Golden Eagles', abbr: 'RAK' },
  ORX: { id: 3011, name: 'ORIX Buffaloes', abbr: 'ORX' },
  SEI: { id: 3012, name: 'Saitama Seibu Lions', abbr: 'SEI' }
};

export type NpbStage = 'first' | 'final' | 'japan';

export interface NpbSeriesEntry {
  /** Which league's Climax Series, or null for the Japan Series. */
  league: 'CL' | 'PL' | null;
  stage: NpbStage;
  /** Club abbreviations (keys of NPB_TEAMS). The higher seed — the club hosting game 1 — first. */
  teams: [string, string];
  /** Series length as NPB counts it: a head start counts toward it (Final Stage 2026: best of 7, or best of 9 with a 2-win head start). */
  bestOf: number;
  /** Wins the first club starts with / the second club starts with (the pennant winner's advantage). */
  headStart: [number, number];
  /** Games won so far, not counting any head start. Drawn games count for neither club. */
  wins: [number, number];
  /** Date of game 1, YYYY-MM-DD. */
  start: string;
}

export interface NpbPostseasonEntry {
  season: number;
  /** When the results below were last entered, YYYY-MM-DD. */
  updated: string;
  series: NpbSeriesEntry[];
}

/**
 * Results as of 2026-10-22 (npb.jp, Wikipedia, Japan Ball). The Japan Series starts Oct 24 — edit `wins` as it goes.
 *
 * 2026 Climax Series: Central League — Giants 0–2 DeNA (First Stage, Tokyo Dome); Hanshin (champion, +1 win) 1–4 DeNA
 * (Final Stage, Koshien). Pacific League — Lions 1–2 Fighters (First Stage, Belluna Dome); SoftBank (champion, +2 wins
 * because it finished 10+ games clear) 5–0 Fighters (Final Stage, Mizuho PayPay Dome). Japan Series: DeNA host games 1–2, 6–7.
 */
export const NPB_POSTSEASON: NpbPostseasonEntry[] = [{
  season: 2026,
  updated: '2026-10-22',
  series: [
    { league: 'CL', stage: 'first', teams: ['YOM', 'DENA'], bestOf: 3, headStart: [0, 0], wins: [0, 2], start: '2026-10-10' },
    { league: 'CL', stage: 'final', teams: ['HAN', 'DENA'], bestOf: 7, headStart: [1, 0], wins: [0, 4], start: '2026-10-14' },
    { league: 'PL', stage: 'first', teams: ['SEI', 'NHF'], bestOf: 3, headStart: [0, 0], wins: [1, 2], start: '2026-10-10' },
    { league: 'PL', stage: 'final', teams: ['SBH', 'NHF'], bestOf: 9, headStart: [2, 0], wins: [3, 0], start: '2026-10-14' },
    { league: null, stage: 'japan', teams: ['DENA', 'SBH'], bestOf: 7, headStart: [0, 0], wins: [0, 0], start: '2026-10-24' }
  ]
}];

export interface NpbPostseasonResult {
  view: PsView;
  source: { kind: 'bundled' | 'projected'; updated?: string };
}

const ROUND: Record<NpbStage, string> = { first: 'First Stage', final: 'Final Stage', japan: 'Japan Series' };
const GAME_TYPE: Record<NpbStage, string> = { first: 'D', final: 'L', japan: 'W' };
const TITLE: Record<'CL' | 'PL', string> = { CL: 'Central League Climax Series', PL: 'Pacific League Climax Series' };

/** Placeholder for a club that isn't known yet (a projection). */
const tbd = (name: string): PsTeam => ({ id: 0, name, abbr: 'TBD' });

function seriesOf(entry: { league: 'CL' | 'PL' | null; stage: NpbStage; teams: [PsTeam, PsTeam]; bestOf: number; headStart: [number, number]; wins: [number, number]; start: string }): PsSeries {
  const need = Math.floor(entry.bestOf / 2) + 1;
  const total: [number, number] = [entry.wins[0] + entry.headStart[0], entry.wins[1] + entry.headStart[1]];
  const winner: 0 | 1 | null = total[0] >= need ? 0 : total[1] >= need ? 1 : null;
  const played = entry.wins[0] + entry.wins[1];
  const hasStart = entry.headStart[0] > 0 || entry.headStart[1] > 0;
  return {
    key: `${entry.league ?? 'NPB'}|${entry.stage}`,
    round: ROUND[entry.stage],
    gameType: GAME_TYPE[entry.stage],
    bestOf: entry.bestOf,
    teams: entry.teams,
    score: total,
    scoreKind: 'wins',
    winner,
    status: winner != null ? 'final' : played > 0 ? 'live' : 'upcoming',
    start: entry.start,
    ...(hasStart ? { headStart: entry.headStart } : {})
  };
}

function assemble(csCl: PsSeries[], csPl: PsSeries[], japan: PsSeries | null, teams: PsTeam[]): PsView {
  const wrap = (title: string, series: PsSeries[]): PsBracket => {
    const decided = series.find(s => s.round === ROUND.final);
    const last = decided ?? series[series.length - 1];
    return {
      title,
      rounds: series.map(s => ({ name: s.round, series: [s] })),
      champion: last.winner != null && last.round === ROUND.final ? last.teams[last.winner] : null
    };
  };
  const brackets: PsBracket[] = [wrap(TITLE.CL, csCl), wrap(TITLE.PL, csPl)];
  let champion: PsTeam | null = null;
  if (japan) {
    champion = japan.winner != null ? japan.teams[japan.winner] : null;
    brackets.push({ title: 'Japan Series', rounds: [{ name: ROUND.japan, series: [japan] }], champion });
  }
  const all = [...csCl, ...csPl, ...(japan ? [japan] : [])];
  const played = all.reduce((n, s) => n + s.score[0] + s.score[1] - (s.headStart ? s.headStart[0] + s.headStart[1] : 0), 0);
  return {
    robins: [],
    brackets,
    pending: all.some(s => s.status !== 'final'),
    games: Math.max(1, played),
    teams,
    // "Champion" in NPB means the Japan Series winner; the Climax Series winners are pennant-race qualifiers
    champions: champion ? [champion] : []
  };
}

/** The bundled results for a season, as a board — or null when none were entered. */
export function npbPostseasonFromData(season: number): NpbPostseasonResult | null {
  const entry = NPB_POSTSEASON.find(e => e.season === season);
  if (!entry) return null;
  const build = (s: NpbSeriesEntry) => seriesOf({ ...s, teams: [NPB_TEAMS[s.teams[0]], NPB_TEAMS[s.teams[1]]] });
  const cs = (league: 'CL' | 'PL') => entry.series.filter(s => s.league === league).sort((a, b) => (a.stage === 'first' ? 0 : 1) - (b.stage === 'first' ? 0 : 1)).map(build);
  const jsEntry = entry.series.find(s => s.stage === 'japan');
  const japan = jsEntry ? build(jsEntry) : null;
  const clubs = new Map<number, PsTeam>();
  for (const s of entry.series) for (const abbr of s.teams) clubs.set(NPB_TEAMS[abbr].id, NPB_TEAMS[abbr]);
  const view = assemble(cs('CL'), cs('PL'), japan, [...clubs.values()].sort((a, b) => a.name.localeCompare(b.name)));
  return { view, source: { kind: 'bundled', updated: entry.updated } };
}

const blockFor = (v: LgStandingsView, word: string): LgBlock | undefined => v.blocks.find(b => b.name.includes(word));

/**
 * Projected board from the standings: the top three of each league. First Stage is 2nd vs 3rd, the Final Stage
 * is 1st vs the First Stage winner, and the Japan Series pairs the two league winners. All "upcoming".
 * Null until both leagues have three clubs with games played.
 */
export function npbPostseasonProjection(standings: LgStandingsView | null | undefined): NpbPostseasonResult | null {
  if (!standings || standings.games <= 0) return null;
  const cl = blockFor(standings, 'Central')?.table.slice(0, 3);
  const pl = blockFor(standings, 'Pacific')?.table.slice(0, 3);
  if (!cl || !pl || cl.length < 3 || pl.length < 3) return null;
  const team = (r: { teamId: number; teamName: string; abbr: string }): PsTeam => ({ id: r.teamId, name: r.teamName, abbr: r.abbr });
  const league = (code: 'CL' | 'PL', top: typeof cl): PsSeries[] => [
    seriesOf({ league: code, stage: 'first', teams: [team(top[1]), team(top[2])], bestOf: 3, headStart: [0, 0], wins: [0, 0], start: '' }),
    seriesOf({ league: code, stage: 'final', teams: [team(top[0]), tbd('First Stage winner')], bestOf: 7, headStart: [1, 0], wins: [0, 0], start: '' })
  ];
  const japan = seriesOf({ league: null, stage: 'japan', teams: [tbd('Central League winner'), tbd('Pacific League winner')], bestOf: 7, headStart: [0, 0], wins: [0, 0], start: '' });
  const clubs = [...cl, ...pl].map(team);
  const view = assemble(league('CL', cl), league('PL', pl), japan, clubs);
  return { view: { ...view, champions: [] }, source: { kind: 'projected' } };
}

/**
 * The postseason board for an NPB season: the bundled results when there are some, otherwise (for the season
 * in progress only) a projection from the standings, otherwise nothing.
 */
export function npbPostseason(season: number, standings: LgStandingsView | null | undefined, current: boolean): NpbPostseasonResult | null {
  return npbPostseasonFromData(season) ?? (current ? npbPostseasonProjection(standings) : null);
}
