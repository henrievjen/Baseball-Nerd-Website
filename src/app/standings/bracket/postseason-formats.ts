/**
 * Postseason format history for the Standings → Postseason Bracket tab.
 *
 * The bracket itself is drawn from the series MLB actually played (so teams,
 * results and best-of lengths always come from the data); this file supplies
 * the *explanation* for each era and tells the builder which shape to expect.
 *
 *   1901–02, 1904  no postseason (World Series began in 1903; 1904 was never played)
 *   1903–1968      World Series only                      → 'ws'
 *   1969–1993      + League Championship Series           → 'lcs'
 *   1981           split-season Division Series           → 'ds'
 *   1994           cancelled by the players' strike       → 'none'
 *   1995–2011      8 teams, Division Series + Wild Card   → 'ds'
 *   2012–2019, 21  10 teams, one-game Wild Card           → 'wcgame'
 *   2020           16 teams, best-of-3 Wild Card Series   → 'wc8'
 *   2022 onward    12 teams, top two seeds get byes       → 'wc6'
 */

export type FormatKind = 'none' | 'ws' | 'lcs' | 'ds' | 'wcgame' | 'wc8' | 'wc6';

export interface SeasonFormat {
  kind: FormatKind;
  /** Short summary line shown under the title, e.g. "12 teams · top two seeds get byes". */
  headline: string;
  /** One paragraph explaining how that year's postseason worked. */
  note: string;
}

export function formatForSeason(year: number): SeasonFormat {
  if (year < 1903) {
    return {
      kind: 'none',
      headline: 'No postseason',
      note: 'The first World Series was played in 1903, so there was no postseason before then.'
    };
  }
  if (year === 1904) {
    return {
      kind: 'none',
      headline: 'No postseason',
      note: 'No World Series was played in 1904 — the National League champion New York Giants declined to face the American League champion.'
    };
  }
  if (year === 1994) {
    return {
      kind: 'none',
      headline: 'No postseason',
      note: 'The players’ strike ended the 1994 season in August and the postseason was cancelled — the only year since 1904 without a World Series.'
    };
  }
  if (year <= 1968) {
    const nine = year === 1903 || (year >= 1919 && year <= 1921);
    return {
      kind: 'ws',
      headline: 'World Series only · 2 teams',
      note: 'Before divisional play, the best team in each league won the pennant and the two pennant winners met directly in the World Series.' +
        (nine ? ' This World Series was a best-of-nine.' : '')
    };
  }
  if (year === 1981) {
    return {
      kind: 'ds',
      headline: '8 teams · split-season Division Series',
      note: 'A players’ strike split the 1981 season in two. The first-half and second-half winners of each division met in a one-time Division Series (best of 5), then played a best-of-5 League Championship Series and the World Series.'
    };
  }
  if (year <= 1993) {
    return {
      kind: 'lcs',
      headline: '4 teams · League Championship Series',
      note: 'Each league was split into East and West divisions in 1969. The two division winners met in the League Championship Series (best of 5 through 1984, best of 7 from 1985) and the winners advanced to the World Series.'
    };
  }
  if (year <= 2011) {
    return {
      kind: 'ds',
      headline: '8 teams · 3 division winners + 1 Wild Card per league',
      note: 'The Wild Card arrived in 1995 along with a third division in each league. The Wild Card team faced the division winner with the best record (unless they were in the same division) in a best-of-5 Division Series; the League Championship Series and World Series were best-of-7.'
    };
  }
  if (year === 2020) {
    return {
      kind: 'wc8',
      headline: '16 teams · expanded for the shortened season',
      note: 'For 2020 only, eight teams per league — three division winners, three runners-up and two Wild Cards — opened with a best-of-3 Wild Card Series hosted by the higher seed (1 v 8, 2 v 7, 3 v 6, 4 v 5) with no byes. The Division Series, League Championship Series and World Series were played at neutral sites.'
    };
  }
  if (year <= 2021) {
    return {
      kind: 'wcgame',
      headline: '10 teams · one-game Wild Card',
      note: 'A second Wild Card was added in 2012. In each league the two Wild Card teams played one sudden-death Wild Card Game, hosted by the team with the better record. The winner then faced the No. 1 seed in the best-of-5 Division Series (or the No. 2 seed if they were division rivals), while the No. 2 and No. 3 division winners met in the other series.'
    };
  }
  return {
    kind: 'wc6',
    headline: '12 teams · top two seeds get byes',
    note: 'Three division winners and three Wild Cards per league. The top two division winners skip the best-of-3 Wild Card Series (3 v 6 and 4 v 5, all games at the higher seed). The bracket is fixed — there is no reseeding: the No. 1 seed always plays the winner of 4/5 and the No. 2 seed the winner of 3/6.'
  };
}
