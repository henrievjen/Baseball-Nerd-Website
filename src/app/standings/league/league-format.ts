/**
 * What each league's postseason looks like, for the Standings page.
 *
 * Two kinds of information, kept apart on purpose:
 *   • `describePostseason` is read from the postseason games the feed actually returned, so it is
 *     right for every league and every season (rounds, best-of lengths, round robins, pools).
 *   • `formatRules` is the league's own qualification / format rules as confirmed from the league's
 *     official sources for one season. Formats change from year to year, so the text is labelled
 *     with the season it was confirmed for and flagged when the page is showing a different one.
 */
import { PsBracket, PsRobin, PsView } from './league-postseason-model';
import { leagueProfile, seasonLabel } from './league-profile';

export interface FormatRule {
  /** The (first-year) season the text was confirmed for — the winter leagues use the year the season began. */
  season: number;
  text: string;
}

const RULES: Record<string, FormatRule[]> = {
  npb: [{
    season: 2026,
    text: 'The top three teams in each league (Central and Pacific) qualify for the Climax Series. First Stage: 2nd vs 3rd, best of 3, every game at the higher seed. ' +
          'Final Stage: the league champion vs the First Stage winner, every game at the champion\'s park. The champion starts one win ahead and the first to four wins advances (best of 7 counting the advantage). ' +
          'New in 2026: if the champion finished 10 or more games ahead of that opponent, or the opponent had a losing record, it starts two wins ahead and the first to five wins advances (best of 9). ' +
          'The two Final Stage winners meet in the Japan Series, best of 7.'
  }],
  afl: [{
    season: 2025,
    text: 'Six teams are seeded into a single-elimination bracket: quarterfinals, semifinals and the championship game are each one game.'
  }],
  lidom: [{
    season: 2025,
    text: 'Six teams play the regular season. The top four advance to an 18-game round robin, and the two best round-robin teams meet in a best-of-7 final.'
  }],
  lmp: [{
    season: 2025,
    text: 'Ten teams. The season is played in two halves and the league ranks teams with a points table (this page ranks by win percentage, so the order can differ). ' +
          'The top eight reach the postseason, and every round is best of 7: First Round, Semifinals, Championship.'
  }],
  lvbp: [{
    season: 2025,
    text: 'Eight teams. The 5th- and 6th-place clubs play a wild-card round for the last round-robin place. Five teams then play a round robin (16 games each) ' +
          'and the top two meet in a best-of-7 final.'
  }],
  prwl: [{
    season: 2025,
    text: 'Six teams. A two-game Division Series, then a best-of-7 Semifinal and a best-of-9 Final. ' +
          'A Division Series that splits 1–1 is shown with the team that went on to the next round as its winner.'
  }],
  abl: [{
    season: 2025,
    text: 'Four teams. The top two in the standings meet in a best-of-3 championship series.'
  }],
  cs: [{
    season: 2026,
    text: 'Five teams, one from each member league, play a round robin. The top four then play single-game semifinals and a single-game final.'
  }],
  aaa: [{
    season: 2026,
    text: 'The first-half winner and the second-half winner of each league (International League, Pacific Coast League) qualify and meet in a best-of-3 League Championship Series. ' +
          'The two league champions then play the Triple-A National Championship, a single game. Use the First half / Second half buttons to see who won each half.'
  }],
  aa: [{
    season: 2026,
    text: 'Each division\'s first-half and second-half winners qualify (use the First half / Second half buttons to see them). The Division Series is best of 3, then the Championship Series is best of 3.'
  }],
  higha: [{
    season: 2026,
    text: 'Each division\'s first-half and second-half winners qualify (use the First half / Second half buttons to see them). The Division Series is best of 3, then the Championship Series is best of 3. ' +
          'The Northwest League has only two qualifiers, who play a single best-of-5 series.'
  }],
  a: [{
    season: 2026,
    text: 'Each division\'s first-half and second-half winners qualify (use the First half / Second half buttons to see them). The Division Series is best of 3, then the Championship Series is best of 3.'
  }],
  rok: [{
    season: 2025,
    text: 'Florida Complex League and Arizona Complex League: single-game semifinals, then a best-of-3 championship series. The Dominican Summer League\'s DSL Cup is played in pools.'
  }]
};

export interface RulesNote {
  text: string;
  /** "2025" or "2025–26": the season the rules were confirmed for. */
  confirmedFor: string;
  /** The page is showing exactly that season. */
  exact: boolean;
}

/** The league's confirmed postseason rules, preferring the viewed season, then the nearest confirmed one. */
export function formatRules(leagueId: string, season: number): RulesNote | null {
  const list = RULES[leagueId];
  const profile = leagueProfile(leagueId);
  if (!list?.length || !profile) return null;
  const exact = list.find(r => r.season === season);
  const pick = exact ?? list.slice().sort((a, b) => Math.abs(a.season - season) - Math.abs(b.season - season) || b.season - a.season)[0];
  return { text: pick.text, confirmedFor: seasonLabel(profile, pick.season), exact: !!exact };
}

/** A cut line drawn on the regular-season table: the teams above it qualify for a postseason by record alone. */
export interface QualifyingCut {
  spots: number;
  badge: string;
  /** Tooltip on the badge. */
  title: string;
  /** Legend text under the tables. */
  legend: string;
}

/**
 * Leagues whose postseason places are decided by the regular-season table alone can show that cut.
 * NPB: the top three of each league reach the Climax Series (the rule has been in place since 2007).
 */
export function qualifyingCut(leagueId: string, season: number): QualifyingCut | null {
  if (leagueId === 'npb' && season >= 2021) {
    return {
      spots: 3,
      badge: 'CS',
      title: 'Top three in the league: a Climax Series place',
      legend: 'in a Climax Series place (top three in each league; final once the regular season is over)'
    };
  }
  return null;
}

// ───────── what the feed's postseason games say ─────────

function bestOfText(counts: number[]): string {
  const uniq = [...new Set(counts)].sort((a, b) => a - b);
  return uniq.map(n => (n <= 1 ? 'single game' : `best of ${n}`)).join(' or ');
}

function robinLine(rs: PsRobin[]): string {
  const name = rs[0].name;
  const teams = rs.reduce((n, r) => n + r.rows.length, 0);
  const games = rs.reduce((n, r) => n + r.games, 0);
  const pools = rs.length > 1 ? `${rs.length} pools, ` : '';
  return `${name} (round robin: ${pools}${teams} teams, ${games} games)`;
}

function bracketLine(b: PsBracket): string {
  return b.rounds.map(r => {
    const n = r.series.length;
    return `${r.name} (${n > 1 ? `${n} series, ` : ''}${bestOfText(r.series.map(s => s.bestOf))})`;
  }).join(' → ');
}

/**
 * Plain-language outline of the postseason as the feed played it, in the order it started.
 * First line is the number of clubs involved; one line per round robin and per bracket after that.
 */
export function describePostseason(view: PsView): string[] {
  if (!view.games) return [];
  const lines = [`${view.teams.length} team${view.teams.length === 1 ? '' : 's'} played in the postseason.`];

  const byName = new Map<string, PsRobin[]>();
  for (const r of view.robins) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);

  const items: Array<{ start: string; order: number; text: string }> = [];
  for (const rs of byName.values()) items.push({ start: rs.reduce((m, r) => (!m || r.start < m ? r.start : m), ''), order: 0, text: robinLine(rs) });
  // brackets that read the same (the minors run one per league, often with identical round names) are listed once
  const same = new Map<string, { start: string; n: number }>();
  for (const b of view.brackets) {
    const start = b.rounds.flatMap(r => r.series.map(s => s.start)).reduce((m, d) => (!m || d < m ? d : m), '');
    const text = bracketLine(b);
    const hit = same.get(text);
    same.set(text, { start: hit && hit.start < start ? hit.start : start, n: (hit?.n ?? 0) + 1 });
  }
  for (const [text, { start, n }] of same) items.push({ start, order: 1, text: n > 1 ? `${text} · ${n} brackets` : text });
  items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.order - b.order));
  return [...lines, ...items.map(i => i.text)];
}
