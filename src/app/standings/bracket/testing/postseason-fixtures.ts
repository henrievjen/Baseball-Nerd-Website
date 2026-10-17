/**
 * Test data for the bracket: postseason series in the exact shape of
 * `statsapi.mlb.com/api/v1/schedule/postseason/series`, for one season of each
 * format era. Used by bracket-model.spec.ts and the browser tests; not part of
 * the app bundle.
 *
 * Team pairings and results follow the real postseasons (2026 is the in-progress
 * one: both LCS under way, World Series not yet set).
 */
import { RawSeries, TeamInfo } from '../bracket-model';

type Id = number;

const NAMES: Record<Id, string> = {
  108: 'Los Angeles Angels', 109: 'Arizona Diamondbacks', 110: 'Baltimore Orioles', 111: 'Boston Red Sox',
  112: 'Chicago Cubs', 113: 'Cincinnati Reds', 114: 'Cleveland Guardians', 115: 'Colorado Rockies',
  116: 'Detroit Tigers', 117: 'Houston Astros', 118: 'Kansas City Royals', 119: 'Los Angeles Dodgers',
  120: 'Washington Nationals', 121: 'New York Mets', 133: 'Athletics', 134: 'Pittsburgh Pirates',
  135: 'San Diego Padres', 136: 'Seattle Mariners', 137: 'San Francisco Giants', 138: 'St. Louis Cardinals',
  139: 'Tampa Bay Rays', 140: 'Texas Rangers', 141: 'Toronto Blue Jays', 142: 'Minnesota Twins',
  143: 'Philadelphia Phillies', 144: 'Atlanta Braves', 145: 'Chicago White Sox', 146: 'Miami Marlins',
  147: 'New York Yankees', 158: 'Milwaukee Brewers'
};

/** Names a club carried in a given season when different from today's. */
const OLD_NAMES: Record<number, Record<Id, string>> = {
  2020: { 114: 'Cleveland Indians', 133: 'Oakland Athletics' },
  2012: { 133: 'Oakland Athletics' },
  1995: { 114: 'Cleveland Indians', 133: 'Oakland Athletics', 120: 'Montreal Expos' },
  1985: { 133: 'Oakland Athletics', 114: 'Cleveland Indians' },
  1981: { 120: 'Montreal Expos', 133: 'Oakland Athletics' },
  1969: {},
  1955: { 119: 'Brooklyn Dodgers' },
  1919: {}
};

export const teamName = (year: number, id: Id): string => OLD_NAMES[year]?.[id] ?? NAMES[id] ?? `Team ${id}`;

const HOME_PATTERN: Record<number, string> = { 1: 'H', 3: 'HHH', 5: 'HHAAH', 7: 'HHAAAHH', 9: 'HHAAAHHAA' };

interface Spec {
  id: string;
  desc: string;
  bestOf: number;
  away: Id | [Id, string];
  home: Id | [Id, string];
  /** Wins for the away / home team of game 1. */
  aw: number;
  hw: number;
  /** Not yet played: one scheduled game on this date. */
  scheduled?: string;
  /** The last played game is in progress. */
  live?: boolean;
}

let pk = 700000;

function series(year: number, s: Spec): RawSeries {
  const [aId, aName] = Array.isArray(s.away) ? s.away : [s.away, teamName(year, s.away)];
  const [hId, hName] = Array.isArray(s.home) ? s.home : [s.home, teamName(year, s.home)];
  const pattern = HOME_PATTERN[s.bestOf] ?? 'H'.repeat(s.bestOf);

  // Order the game winners: alternate, the series winner takes the last game.
  const aWon = s.aw > s.hw;
  const winnerWins = Math.max(s.aw, s.hw);
  const loserWins = Math.min(s.aw, s.hw);
  const seq: boolean[] = [];   // true = away-of-game-1 wins
  let w = winnerWins - (s.aw !== s.hw ? 1 : 0), l = loserWins;
  while (w + l > 0) {
    if (l > 0 && (seq.length % 2 === 1 || w === 0)) { seq.push(!aWon); l--; }
    else { seq.push(aWon); w--; }
  }
  if (s.aw !== s.hw) seq.push(aWon);

  const games: any[] = [];
  const total = s.scheduled ? 1 : seq.length;
  for (let i = 0; i < total; i++) {
    const day = String(1 + i).padStart(2, '0');
    const aIsHome = pattern[i % pattern.length] === 'A';
    const winnerIsA = s.scheduled ? false : seq[i];
    const sc = (isA: boolean) => (s.scheduled ? undefined : (isA === winnerIsA ? 5 : 2));
    const side = (id: Id, name: string, isA: boolean) => ({
      team: { id, name, link: `/api/v1/teams/${id}` },
      score: sc(isA),
      isWinner: s.scheduled ? undefined : isA === winnerIsA
    });
    const a = side(aId, aName, true);
    const h = side(hId, hName, false);
    const lastLive = !!s.live && i === total - 1;
    games.push({
      gamePk: pk++,
      gameType: s.id[0],
      season: String(year),
      gameDate: `${year}-${s.scheduled ? s.scheduled.slice(5, 10) : '10-' + day}T20:00:00Z`,
      officialDate: s.scheduled ?? `${year}-10-${day}`,
      status: lastLive
        ? { abstractGameState: 'Live', detailedState: 'In Progress' }
        : s.scheduled
          ? { abstractGameState: 'Preview', detailedState: 'Scheduled' }
          : { abstractGameState: 'Final', detailedState: 'Final' },
      teams: aIsHome ? { away: h, home: a } : { away: a, home: h },
      gamesInSeries: s.bestOf,
      seriesGameNumber: i + 1,
      gameNumber: 1,
      seriesDescription: s.desc,
      ifNecessary: 'N'
    });
  }
  return { series: { id: s.id, gameType: s.id[0] }, games } as RawSeries;
}

const PH_AL: [Id, string] = [21, 'AL Champion'];
const PH_NL: [Id, string] = [31, 'NL Champion'];

/** Series feed for one season of each format era. */
export function postseasonFixture(year: number): RawSeries[] {
  const S = (s: Spec) => series(year, s);
  switch (year) {
    /* 2026 — in progress (12 teams, byes); World Series not yet set */
    case 2026: return [
      S({ id: 'F_1', desc: 'AL Wild Card Series (3 vs. 6)', bestOf: 3, away: 145, home: 117, aw: 2, hw: 0 }),
      S({ id: 'F_2', desc: 'AL Wild Card Series (4 vs. 5)', bestOf: 3, away: 111, home: 147, aw: 0, hw: 2 }),
      S({ id: 'F_3', desc: 'NL Wild Card Series (3 vs. 6)', bestOf: 3, away: 143, home: 144, aw: 1, hw: 2 }),
      S({ id: 'F_4', desc: 'NL Wild Card Series (4 vs. 5)', bestOf: 3, away: 112, home: 135, aw: 0, hw: 2 }),
      S({ id: 'D_1', desc: 'ALDS', bestOf: 5, away: 147, home: 139, aw: 0, hw: 3 }),
      S({ id: 'D_2', desc: 'ALDS', bestOf: 5, away: 145, home: 114, aw: 2, hw: 3 }),
      S({ id: 'D_3', desc: 'NLDS', bestOf: 5, away: 135, home: 158, aw: 1, hw: 3 }),
      S({ id: 'D_4', desc: 'NLDS', bestOf: 5, away: 144, home: 119, aw: 1, hw: 3 }),
      S({ id: 'L_1', desc: 'ALCS', bestOf: 7, away: 114, home: 139, aw: 1, hw: 1, live: false }),
      S({ id: 'L_2', desc: 'NLCS', bestOf: 7, away: 119, home: 158, aw: 0, hw: 3 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: PH_AL, home: PH_NL, aw: 0, hw: 0, scheduled: '2026-10-24' })
    ];

    /* 2026 as of the end of the Wild Card round — Division Series not created yet */
    case 20260: return [
      S({ id: 'F_1', desc: 'AL Wild Card Series (3 vs. 6)', bestOf: 3, away: 145, home: 117, aw: 2, hw: 0 }),
      S({ id: 'F_2', desc: 'AL Wild Card Series (4 vs. 5)', bestOf: 3, away: 111, home: 147, aw: 0, hw: 2 }),
      S({ id: 'F_3', desc: 'NL Wild Card Series (3 vs. 6)', bestOf: 3, away: 143, home: 144, aw: 1, hw: 2 }),
      S({ id: 'F_4', desc: 'NL Wild Card Series (4 vs. 5)', bestOf: 3, away: 112, home: 135, aw: 1, hw: 1 })
    ];

    /* 2025 — 12 teams, byes for the top two seeds */
    case 2025: return [
      S({ id: 'F_1', desc: 'AL Wild Card Series (3 vs. 6)', bestOf: 3, away: 116, home: 114, aw: 2, hw: 1 }),
      S({ id: 'F_2', desc: 'AL Wild Card Series (4 vs. 5)', bestOf: 3, away: 111, home: 147, aw: 1, hw: 2 }),
      S({ id: 'F_3', desc: 'NL Wild Card Series (3 vs. 6)', bestOf: 3, away: 113, home: 119, aw: 0, hw: 2 }),
      S({ id: 'F_4', desc: 'NL Wild Card Series (4 vs. 5)', bestOf: 3, away: 135, home: 112, aw: 1, hw: 2 }),
      S({ id: 'D_1', desc: 'ALDS', bestOf: 5, away: 147, home: 141, aw: 1, hw: 3 }),
      S({ id: 'D_2', desc: 'ALDS', bestOf: 5, away: 116, home: 136, aw: 2, hw: 3 }),
      S({ id: 'D_3', desc: 'NLDS', bestOf: 5, away: 112, home: 158, aw: 2, hw: 3 }),
      S({ id: 'D_4', desc: 'NLDS', bestOf: 5, away: 119, home: 143, aw: 3, hw: 1 }),
      S({ id: 'L_1', desc: 'ALCS', bestOf: 7, away: 136, home: 141, aw: 3, hw: 4 }),
      S({ id: 'L_2', desc: 'NLCS', bestOf: 7, away: 119, home: 158, aw: 4, hw: 0 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 119, home: 141, aw: 4, hw: 3 })
    ];

    /* 2022 — first year of the 12-team format (seeds 1 and 2 had byes) */
    case 2022: return [
      S({ id: 'F_1', desc: 'AL Wild Card Series (3 vs. 6)', bestOf: 3, away: 139, home: 114, aw: 0, hw: 2 }),
      S({ id: 'F_2', desc: 'AL Wild Card Series (4 vs. 5)', bestOf: 3, away: 136, home: 141, aw: 2, hw: 0 }),
      S({ id: 'F_3', desc: 'NL Wild Card Series (3 vs. 6)', bestOf: 3, away: 143, home: 138, aw: 2, hw: 0 }),
      S({ id: 'F_4', desc: 'NL Wild Card Series (4 vs. 5)', bestOf: 3, away: 135, home: 121, aw: 2, hw: 1 }),
      S({ id: 'D_1', desc: 'ALDS', bestOf: 5, away: 136, home: 117, aw: 0, hw: 3 }),
      S({ id: 'D_2', desc: 'ALDS', bestOf: 5, away: 114, home: 147, aw: 2, hw: 3 }),
      S({ id: 'D_3', desc: 'NLDS', bestOf: 5, away: 135, home: 119, aw: 3, hw: 1 }),
      S({ id: 'D_4', desc: 'NLDS', bestOf: 5, away: 143, home: 144, aw: 3, hw: 1 }),
      S({ id: 'L_1', desc: 'ALCS', bestOf: 7, away: 147, home: 117, aw: 0, hw: 4 }),
      S({ id: 'L_2', desc: 'NLCS', bestOf: 7, away: 143, home: 135, aw: 4, hw: 1 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 143, home: 117, aw: 2, hw: 4 })
    ];

    /* 2020 — 16 teams, best-of-3 Wild Card Series, no byes */
    case 2020: return [
      S({ id: 'F_1', desc: 'AL Wild Card Series (A)', bestOf: 3, away: 141, home: 139, aw: 0, hw: 2 }),
      S({ id: 'F_2', desc: 'AL Wild Card Series (B)', bestOf: 3, away: 145, home: 133, aw: 1, hw: 2 }),
      S({ id: 'F_3', desc: 'AL Wild Card Series (C)', bestOf: 3, away: 117, home: 142, aw: 2, hw: 0 }),
      S({ id: 'F_4', desc: 'AL Wild Card Series (D)', bestOf: 3, away: 147, home: 114, aw: 2, hw: 0 }),
      S({ id: 'F_5', desc: 'NL Wild Card Series (A)', bestOf: 3, away: 158, home: 119, aw: 0, hw: 2 }),
      S({ id: 'F_6', desc: 'NL Wild Card Series (B)', bestOf: 3, away: 113, home: 144, aw: 0, hw: 2 }),
      S({ id: 'F_7', desc: 'NL Wild Card Series (C)', bestOf: 3, away: 146, home: 112, aw: 2, hw: 0 }),
      S({ id: 'F_8', desc: 'NL Wild Card Series (D)', bestOf: 3, away: 138, home: 135, aw: 1, hw: 2 }),
      S({ id: 'D_1', desc: 'AL Division Series (A)', bestOf: 5, away: 147, home: 139, aw: 2, hw: 3 }),
      S({ id: 'D_2', desc: 'AL Division Series (B)', bestOf: 5, away: 117, home: 133, aw: 3, hw: 1 }),
      S({ id: 'D_3', desc: 'NL Division Series (A)', bestOf: 5, away: 135, home: 119, aw: 0, hw: 3 }),
      S({ id: 'D_4', desc: 'NL Division Series (B)', bestOf: 5, away: 146, home: 144, aw: 0, hw: 3 }),
      S({ id: 'L_1', desc: 'AL Championship Series', bestOf: 7, away: 117, home: 139, aw: 3, hw: 4 }),
      S({ id: 'L_2', desc: 'NL Championship Series', bestOf: 7, away: 144, home: 119, aw: 3, hw: 4 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 139, home: 119, aw: 2, hw: 4 })
    ];

    /* 2012 — one-game Wild Card; 2-3 Division Series */
    case 2012: return [
      S({ id: 'F_1', desc: 'AL Wild Card Game', bestOf: 1, away: 110, home: 140, aw: 1, hw: 0 }),
      S({ id: 'F_2', desc: 'NL Wild Card Game', bestOf: 1, away: 138, home: 144, aw: 1, hw: 0 }),
      S({ id: 'D_1', desc: "ALDS 'A' (AL Division Series)", bestOf: 5, away: 133, home: 116, aw: 2, hw: 3 }),
      S({ id: 'D_2', desc: "ALDS 'B' (AL Division Series)", bestOf: 5, away: 147, home: 110, aw: 3, hw: 2 }),
      S({ id: 'D_3', desc: "NLDS 'A' (NL Division Series)", bestOf: 5, away: 113, home: 137, aw: 2, hw: 3 }),
      S({ id: 'D_4', desc: "NLDS 'B' (NL Division Series)", bestOf: 5, away: 120, home: 138, aw: 2, hw: 3 }),
      S({ id: 'L_1', desc: 'ALCS (AL Championship Series)', bestOf: 7, away: 116, home: 147, aw: 4, hw: 0 }),
      S({ id: 'L_2', desc: 'NLCS (NL Championship Series)', bestOf: 7, away: 138, home: 137, aw: 3, hw: 4 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 116, home: 137, aw: 0, hw: 4 })
    ];

    /* 1995 — 8 teams, first Wild Card year */
    case 1995: return [
      S({ id: 'D_1', desc: "AL Division Series (\"ALDS 'A'\")", bestOf: 5, away: 111, home: 114, aw: 0, hw: 3 }),
      S({ id: 'D_2', desc: "AL Division Series (\"ALDS 'B'\")", bestOf: 5, away: 136, home: 147, aw: 3, hw: 2 }),
      S({ id: 'D_3', desc: "NL Division Series (\"NLDS 'A'\")", bestOf: 5, away: 144, home: 115, aw: 3, hw: 1 }),
      S({ id: 'D_4', desc: "NL Division Series (\"NLDS 'B'\")", bestOf: 5, away: 113, home: 119, aw: 3, hw: 0 }),
      S({ id: 'L_1', desc: 'AL Championship Series', bestOf: 7, away: 114, home: 136, aw: 4, hw: 2 }),
      S({ id: 'L_2', desc: 'NL Championship Series', bestOf: 7, away: 144, home: 113, aw: 4, hw: 0 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 114, home: 144, aw: 2, hw: 4 })
    ];

    /* 1978 — League Championship Series only (best-of-5) */
    case 1978: return [
      S({ id: 'L_1', desc: 'AL Championship Series', bestOf: 5, away: 118, home: 147, aw: 1, hw: 3 }),
      S({ id: 'L_2', desc: 'NL Championship Series', bestOf: 5, away: 143, home: 119, aw: 1, hw: 3 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 119, home: 147, aw: 2, hw: 4 })
    ];

    /* 1993 — last year before the Division Series (best-of-7 LCS) */
    case 1993: return [
      S({ id: 'L_1', desc: 'AL Championship Series', bestOf: 7, away: 145, home: 141, aw: 2, hw: 4 }),
      S({ id: 'L_2', desc: 'NL Championship Series', bestOf: 7, away: 144, home: 143, aw: 2, hw: 4 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 143, home: 141, aw: 2, hw: 4 })
    ];

    /* 1985 — League Championship Series became best-of-7 */
    case 1985: return [
      S({ id: 'L_1', desc: 'AL Championship Series', bestOf: 7, away: 141, home: 118, aw: 3, hw: 4 }),
      S({ id: 'L_2', desc: 'NL Championship Series', bestOf: 7, away: 138, home: 119, aw: 4, hw: 2 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 138, home: 118, aw: 3, hw: 4 })
    ];

    /* 1981 — split-season Division Series */
    case 1981: return [
      S({ id: 'D_1', desc: 'AL Division Series', bestOf: 5, away: 158, home: 147, aw: 2, hw: 3 }),
      S({ id: 'D_2', desc: 'AL Division Series', bestOf: 5, away: 118, home: 133, aw: 0, hw: 3 }),
      S({ id: 'D_3', desc: 'NL Division Series', bestOf: 5, away: 143, home: 120, aw: 2, hw: 3 }),
      S({ id: 'D_4', desc: 'NL Division Series', bestOf: 5, away: 117, home: 119, aw: 2, hw: 3 }),
      S({ id: 'L_1', desc: 'AL Championship Series', bestOf: 5, away: 133, home: 147, aw: 0, hw: 3 }),
      S({ id: 'L_2', desc: 'NL Championship Series', bestOf: 5, away: 120, home: 119, aw: 2, hw: 3 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 147, home: 119, aw: 2, hw: 4 })
    ];

    /* 1969 — first League Championship Series (best of 5) */
    case 1969: return [
      S({ id: 'L_1', desc: 'AL Championship Series', bestOf: 5, away: 142, home: 110, aw: 0, hw: 3 }),
      S({ id: 'L_2', desc: 'NL Championship Series', bestOf: 5, away: 144, home: 121, aw: 0, hw: 3 }),
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 121, home: 110, aw: 4, hw: 1 })
    ];

    /* 1955 — World Series only */
    case 1955: return [
      S({ id: 'W_1', desc: 'World Series', bestOf: 7, away: 119, home: 147, aw: 4, hw: 3 })
    ];

    /* 1919 — best-of-nine World Series (listed NL-team-first to exercise league ordering) */
    case 1919: return [
      S({ id: 'W_1', desc: 'World Series', bestOf: 9, away: 113, home: 145, aw: 5, hw: 3 })
    ];

    default: return [];
  }
}

/** League / division rank / win% for the teams above (what the standings feed supplies). */
export function infoFor(year: number): Map<Id, TeamInfo> {
  const m = new Map<Id, TeamInfo>();
  const al = (id: Id, rank: number, pct: number) => m.set(id, { league: 'AL', divisionRank: rank, pct });
  const nl = (id: Id, rank: number, pct: number) => m.set(id, { league: 'NL', divisionRank: rank, pct });
  switch (year) {
    case 2012:
      al(147, 1, 0.586); al(133, 1, 0.580); al(116, 1, 0.543); al(110, 2, 0.574); al(140, 2, 0.574);
      nl(120, 1, 0.605); nl(113, 1, 0.599); nl(137, 1, 0.580); nl(138, 2, 0.543); nl(144, 2, 0.580);
      break;
    case 1995:
      al(111, 1, 0.597); al(114, 1, 0.694); al(136, 1, 0.545); al(147, 2, 0.538);
      nl(144, 1, 0.625); nl(113, 1, 0.590); nl(119, 1, 0.535); nl(115, 2, 0.545);
      break;
    case 1955:
      al(147, 1, 0.623); nl(119, 1, 0.641);
      break;
    case 1919:
      al(145, 1, 0.629); nl(113, 1, 0.686);
      break;
    case 2025:
      al(141, 1, 0.593); al(136, 1, 0.586); al(114, 1, 0.519); al(147, 2, 0.549); al(111, 2, 0.543); al(116, 2, 0.543);
      nl(158, 1, 0.636); nl(143, 1, 0.571); nl(119, 1, 0.574); nl(112, 2, 0.574); nl(135, 2, 0.550); nl(113, 2, 0.512);
      break;
    default: break;
  }
  return m;
}
