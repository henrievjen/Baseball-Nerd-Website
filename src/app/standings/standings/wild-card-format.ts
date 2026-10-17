/**
 * What the Standings → Wild Card tab shows for each season.
 *
 * The number of Wild Card teams per league has changed over the years, and MLB's
 * "wildCard" standings feed ranks the non-division-winners in EVERY season (even
 * before the Wild Card existed), so the rank alone can't be trusted to say who
 * actually got a Wild Card spot. This file holds the rule for each era and turns
 * the raw standings into the rows the tab draws.
 *
 *   1901–1968  no divisions, no Wild Card — the best record in each league wins the pennant
 *   1969–1993  two divisions per league, no Wild Card (1981: split season)
 *   1994       three divisions, Wild Card planned — season ended by the strike, never awarded
 *   1995–2011  1 Wild Card per league
 *   2012–2019  2 Wild Cards per league (one-game Wild Card Game)            [also 2021]
 *   2020       8 teams per league: 3 division winners, 3 runners-up, 2 Wild Cards
 *   2022 on    3 Wild Cards per league (12-team field)
 */

export interface WildCardFormat {
  /** Wild Card teams per league (0 = none that season). */
  spots: number;
  /** Does the season have divisions? (If not, the league leader is the pennant winner.) */
  divisions: boolean;
  /** 2020 only: the three second-place division teams also qualified, ahead of the Wild Cards. */
  runnersUp: boolean;
  headline: string;
  note: string;
  /** Heading above the first column ("Division Leaders", "Pennant Winner", …). */
  leadersTitle: string;
  /** Shown in place of the Wild Card table when `spots` is 0. */
  noneReason: string;
}

export function wildCardFormat(year: number): WildCardFormat {
  if (year <= 1968) {
    const noWs = year <= 1902 ? ' (The first World Series was played in 1903.)' : year === 1904 ? ' (No World Series was played in 1904.)' : '';
    return {
      spots: 0, divisions: false, runnersUp: false,
      headline: 'No Wild Card · pennant winners only',
      note: 'Before 1969 there were no divisions and no playoffs. The team with the best record in each league won the pennant, and the two pennant winners met in the World Series.' + noWs,
      leadersTitle: 'Pennant Winner',
      noneReason: 'Only the pennant winner in each league reached the postseason.'
    };
  }
  if (year === 1981) {
    return {
      spots: 0, divisions: true, runnersUp: false,
      headline: 'No Wild Card · split season',
      note: 'A players’ strike split 1981 into two halves. The first-half and second-half winners of each division reached the postseason — there was no Wild Card yet. The leaders below are by full-season record, so they can differ from the teams that actually qualified.',
      leadersTitle: 'Division Leaders (full season)',
      noneReason: 'The first- and second-half division winners qualified instead.'
    };
  }
  if (year <= 1993) {
    return {
      spots: 0, divisions: true, runnersUp: false,
      headline: 'No Wild Card · two divisions per league',
      note: 'The Wild Card did not exist yet. From 1969 each league was split into an East and a West division, and only the two division winners reached the postseason.',
      leadersTitle: 'Division Leaders',
      noneReason: 'Only the division winners reached the postseason.'
    };
  }
  if (year === 1994) {
    return {
      spots: 0, divisions: true, runnersUp: false,
      headline: 'No Wild Card · season ended by the strike',
      note: 'The Wild Card was due to debut in 1994, when each league added a third division. The players’ strike ended the season in August and the postseason was cancelled, so no Wild Card team was ever awarded. Standings are as of the stoppage.',
      leadersTitle: 'Division Leaders',
      noneReason: 'The season ended before any Wild Card could be awarded.'
    };
  }
  if (year <= 2011) {
    return {
      spots: 1, divisions: true, runnersUp: false,
      headline: '1 Wild Card per league',
      note: 'The Wild Card began in 1995, along with a third division in each league. The non-division-winner with the best record claims the one Wild Card spot and joins the three division winners.',
      leadersTitle: 'Division Leaders',
      noneReason: ''
    };
  }
  if (year === 2020) {
    return {
      spots: 2, divisions: true, runnersUp: true,
      headline: '2 Wild Cards per league · plus 3 division runners-up',
      note: 'For 2020 only, eight teams per league qualified: the three division winners (seeds 1–3), the three division runners-up (seeds 4–6) and the two best remaining teams — the Wild Cards (seeds 7–8).',
      leadersTitle: 'Division Leaders',
      noneReason: ''
    };
  }
  if (year <= 2021) {
    return {
      spots: 2, divisions: true, runnersUp: false,
      headline: '2 Wild Cards per league',
      note: 'A second Wild Card was added in 2012. The two best non-division-winners in each league qualify and play a single Wild Card Game, with the winner advancing to the Division Series.',
      leadersTitle: 'Division Leaders',
      noneReason: ''
    };
  }
  return {
    spots: 3, divisions: true, runnersUp: false,
    headline: '3 Wild Cards per league',
    note: 'Since 2022 twelve teams qualify: three division winners (seeds 1–3, ranked by record) and three Wild Cards (seeds 4–6), the best non-division-winners. The top two division winners skip the Wild Card Series.',
    leadersTitle: 'Division Leaders',
    noneReason: ''
  };
}

/* ───────────────────────── rows ───────────────────────── */

export interface WcRow {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  pct: string;
  gb: string;
  /** Games behind the last Wild Card spot ("—" when at or ahead of it). */
  wcGb: string;
  /** 1-based place in the Wild Card race (Wild Card table only). */
  rank: number;
  /** Division name, or "Pennant winner". */
  sub: string;
  /** Holds a Wild Card spot (Wild Card table only). */
  inSpot: boolean;
}

export interface WcLeague {
  key: 'AL' | 'NL';
  name: string;
  leaders: WcRow[];
  /** All non-division-winners in Wild Card order, with the first `spots` flagged `inSpot`. */
  wildCards: WcRow[];
  /** 2020 only. */
  runnersUp: WcRow[];
}

export interface WcView {
  format: WildCardFormat;
  leagues: WcLeague[];
  /** A Wild Card season whose Wild Card standings could not be loaded. */
  wildCardMissing: boolean;
}

const LEAGUES: Record<number, { key: 'AL' | 'NL'; name: string }> = {
  103: { key: 'AL', name: 'American League' },
  104: { key: 'NL', name: 'National League' }
};

const num = (v: unknown, dflt = 0): number => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : dflt;
};
const pctOf = (r: { pct: string }) => parseFloat(r.pct) || 0;
const shortDivision = (n: string | undefined) =>
  (n ?? '').replace('American League ', 'AL ').replace('National League ', 'NL ');
const dash = (g: unknown) => (g === '-' || g === '0.0' || g === '0' || g == null || g === '' ? '—' : String(g));

function toRow(tr: any, sub = ''): WcRow {
  return {
    teamId: tr.team?.id,
    teamName: tr.team?.name,
    wins: tr.wins,
    losses: tr.losses,
    pct: tr.winningPercentage,
    gb: dash(tr.gamesBack),
    wcGb: dash(tr.wildCardGamesBack),
    rank: 0,
    sub,
    inSpot: false
  };
}

/**
 * @param standings  `standingsTypes=regularSeason` records (one per division, or per league before 1969)
 * @param wildCard   `standingsTypes=wildCard` records, or null when not fetched / unavailable
 */
export function buildWildCardView(season: number, standings: any[], wildCard: any[] | null): WcView {
  const format = wildCardFormat(season);
  const byLeague = new Map<'AL' | 'NL', WcLeague>();
  const league = (id: number): WcLeague | null => {
    const meta = LEAGUES[id];
    if (!meta) return null;
    let lg = byLeague.get(meta.key);
    if (!lg) { lg = { key: meta.key, name: meta.name, leaders: [], wildCards: [], runnersUp: [] }; byLeague.set(meta.key, lg); }
    return lg;
  };

  for (const rec of standings ?? []) {
    const lg = league(rec.league?.id);
    const teams: any[] = rec.teamRecords ?? [];
    if (!lg || !teams.length) continue;

    if (format.divisions) {
      const ranked = teams.slice().sort((a, b) =>
        (num(a.divisionRank, 99) - num(b.divisionRank, 99)) || ((parseFloat(b.winningPercentage) || 0) - (parseFloat(a.winningPercentage) || 0)));
      const div = shortDivision(rec.division?.name);
      lg.leaders.push(toRow(ranked[0], div));
      if (format.runnersUp) {
        const second = ranked.find(t => num(t.divisionRank, 99) === 2);
        if (second) lg.runnersUp.push(toRow(second, div));
      }
    } else {
      // no divisions: the league's best record is the pennant winner
      const ranked = teams.slice().sort((a, b) =>
        (num(a.leagueRank, 99) - num(b.leagueRank, 99)) || ((parseFloat(b.winningPercentage) || 0) - (parseFloat(a.winningPercentage) || 0)));
      lg.leaders.push(toRow(ranked[0], 'Pennant winner'));
    }
  }

  if (format.spots > 0) {
    for (const rec of wildCard ?? []) {
      const lg = league(rec.league?.id);
      if (!lg) continue;
      for (const tr of rec.teamRecords ?? []) {
        const r = toRow(tr);
        r.rank = num(tr.wildCardRank, 99);
        lg.wildCards.push(r);
      }
    }
  }

  const leagues = (['AL', 'NL'] as const).map(k => byLeague.get(k)).filter((l): l is WcLeague => !!l);
  for (const lg of leagues) {
    lg.leaders.sort((a, b) => pctOf(b) - pctOf(a));
    lg.runnersUp.sort((a, b) => pctOf(b) - pctOf(a));
    lg.wildCards.sort((a, b) => (a.rank - b.rank) || (pctOf(b) - pctOf(a)));
    lg.wildCards.forEach((r, i) => { r.rank = i + 1; r.inSpot = i < format.spots; });
  }

  return {
    format,
    leagues,
    wildCardMissing: format.spots > 0 && (wildCard == null || leagues.some(l => !l.wildCards.length))
  };
}
