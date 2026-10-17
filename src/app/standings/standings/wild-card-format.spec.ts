import { buildWildCardView, wildCardFormat } from './wild-card-format';

/** A standings team record in the shape MLB's API returns it. */
function tr(id: number, name: string, w: number, l: number, o: { dr?: number; lr?: number; wcr?: number; wcgb?: string; gb?: string } = {}) {
  return {
    team: { id, name }, wins: w, losses: l,
    winningPercentage: (w / (w + l)).toFixed(3).replace(/^0/, ''),
    gamesBack: o.gb ?? '-',
    divisionRank: o.dr != null ? String(o.dr) : undefined,
    leagueRank: o.lr != null ? String(o.lr) : undefined,
    wildCardRank: o.wcr != null ? String(o.wcr) : undefined,
    wildCardGamesBack: o.wcgb
  };
}
const AL = { id: 103 }, NL = { id: 104 };
const div = (league: { id: number }, name: string, teams: any[]) => ({ league, division: { name }, teamRecords: teams });
const league = (lg: { id: number }, teams: any[]) => ({ league: lg, teamRecords: teams });

describe('wildCardFormat — Wild Card spots per league by season', () => {
  it('none through 1993 (including the split 1981 season) and in 1994', () => {
    for (const y of [1901, 1903, 1955, 1968, 1969, 1978, 1981, 1985, 1993, 1994]) {
      expect(wildCardFormat(y).spots).withContext(String(y)).toBe(0);
      expect(wildCardFormat(y).noneReason.length).withContext(String(y)).toBeGreaterThan(0);
      expect(wildCardFormat(y).headline).withContext(String(y)).toMatch(/^No Wild Card/);
    }
  });

  it('one Wild Card from 1995 to 2011', () => {
    for (const y of [1995, 1998, 2005, 2011]) expect(wildCardFormat(y).spots).withContext(String(y)).toBe(1);
  });

  it('two Wild Cards in 2012–2019 and 2021', () => {
    for (const y of [2012, 2015, 2019, 2021]) {
      expect(wildCardFormat(y).spots).withContext(String(y)).toBe(2);
      expect(wildCardFormat(y).runnersUp).toBeFalse();
    }
  });

  it('2020: two Wild Cards plus three division runners-up', () => {
    const f = wildCardFormat(2020);
    expect(f.spots).toBe(2);
    expect(f.runnersUp).toBeTrue();
  });

  it('three Wild Cards from 2022', () => {
    for (const y of [2022, 2024, 2026, 2030]) expect(wildCardFormat(y).spots).withContext(String(y)).toBe(3);
  });

  it('only the divisional eras have divisions', () => {
    expect(wildCardFormat(1968).divisions).toBeFalse();
    expect(wildCardFormat(1969).divisions).toBeTrue();
    expect(wildCardFormat(1968).leadersTitle).toBe('Pennant Winner');
    expect(wildCardFormat(1981).leadersTitle).toContain('full season');
  });

  it('every format has a headline and an explanation', () => {
    for (let y = 1901; y <= 2026; y++) {
      const f = wildCardFormat(y);
      expect(f.headline.length).withContext(String(y)).toBeGreaterThan(5);
      expect(f.note.length).withContext(String(y)).toBeGreaterThan(40);
    }
  });
});

describe('buildWildCardView', () => {
  // 2025-style: three divisions + six non-winners in the Wild Card feed
  const standings2025 = [
    div(AL, 'American League East', [tr(141, 'Toronto Blue Jays', 94, 68, { dr: 1 }), tr(147, 'New York Yankees', 94, 68, { dr: 2 }), tr(111, 'Boston Red Sox', 89, 73, { dr: 3 })]),
    div(AL, 'American League Central', [tr(114, 'Cleveland Guardians', 88, 74, { dr: 1 }), tr(116, 'Detroit Tigers', 87, 75, { dr: 2 })]),
    div(AL, 'American League West', [tr(136, 'Seattle Mariners', 90, 72, { dr: 1 }), tr(117, 'Houston Astros', 87, 75, { dr: 2 })]),
    div(NL, 'National League East', [tr(143, 'Philadelphia Phillies', 96, 66, { dr: 1 }), tr(121, 'New York Mets', 83, 79, { dr: 2 })]),
    div(NL, 'National League Central', [tr(158, 'Milwaukee Brewers', 97, 65, { dr: 1 }), tr(112, 'Chicago Cubs', 92, 70, { dr: 2 })]),
    div(NL, 'National League West', [tr(119, 'Los Angeles Dodgers', 93, 69, { dr: 1 }), tr(135, 'San Diego Padres', 90, 72, { dr: 2 })])
  ];
  const wc2025 = [
    league(AL, [tr(147, 'New York Yankees', 94, 68, { wcr: 1, wcgb: '+4.0' }), tr(111, 'Boston Red Sox', 89, 73, { wcr: 2, wcgb: '-' }),
                tr(116, 'Detroit Tigers', 87, 75, { wcr: 3, wcgb: '2.0' }), tr(117, 'Houston Astros', 87, 75, { wcr: 4, wcgb: '2.0' })]),
    league(NL, [tr(112, 'Chicago Cubs', 92, 70, { wcr: 1, wcgb: '+4.0' }), tr(135, 'San Diego Padres', 90, 72, { wcr: 2, wcgb: '-' }),
                tr(121, 'New York Mets', 83, 79, { wcr: 3, wcgb: '2.0' })])
  ];

  it('2025: three Wild Cards per league, flagged by position, with the cut line after the third', () => {
    const v = buildWildCardView(2025, standings2025, wc2025);
    expect(v.format.spots).toBe(3);
    expect(v.wildCardMissing).toBeFalse();
    expect(v.leagues.map(l => l.key)).toEqual(['AL', 'NL']);
    const al = v.leagues[0];
    expect(al.wildCards.map(r => `${r.rank}:${r.teamName}:${r.inSpot}`)).toEqual([
      '1:New York Yankees:true', '2:Boston Red Sox:true', '3:Detroit Tigers:true', '4:Houston Astros:false'
    ]);
    expect(al.wildCards[0].wcGb).toBe('+4.0');
    expect(al.wildCards[1].wcGb).toBe('—');
    expect(al.runnersUp).toEqual([]);
  });

  it('2025: division leaders are the three division winners, best record first', () => {
    const al = buildWildCardView(2025, standings2025, wc2025).leagues[0];
    expect(al.leaders.map(r => r.teamName)).toEqual(['Toronto Blue Jays', 'Seattle Mariners', 'Cleveland Guardians']);
    expect(al.leaders.map(r => r.sub)).toEqual(['AL East', 'AL West', 'AL Central']);
    const nl = buildWildCardView(2025, standings2025, wc2025).leagues[1];
    expect(nl.leaders[0].teamName).toBe('Milwaukee Brewers');
  });

  it('2012: two Wild Cards even though the feed lists every non-winner', () => {
    const wc = [league(AL, [tr(110, 'Baltimore Orioles', 93, 69, { wcr: 1 }), tr(140, 'Texas Rangers', 93, 69, { wcr: 2 }), tr(144, 'Atlanta Braves', 94, 68, { wcr: 3 })]), league(NL, [])];
    const v = buildWildCardView(2012, standings2025, wc);
    expect(v.format.spots).toBe(2);
    expect(v.leagues[0].wildCards.map(r => r.inSpot)).toEqual([true, true, false]);
  });

  it('1995–2011: exactly one Wild Card', () => {
    const v = buildWildCardView(2005, standings2025, wc2025);
    expect(v.leagues[0].wildCards.filter(r => r.inSpot).map(r => r.teamName)).toEqual(['New York Yankees']);
    expect(v.leagues[1].wildCards.filter(r => r.inSpot).map(r => r.teamName)).toEqual(['Chicago Cubs']);
  });

  it('2020: two Wild Cards plus the three division runners-up (second place, best record first)', () => {
    const v = buildWildCardView(2020, standings2025, wc2025);
    const al = v.leagues[0];
    expect(al.runnersUp.map(r => r.teamName)).toEqual(['New York Yankees', 'Detroit Tigers', 'Houston Astros']);
    expect(al.runnersUp.map(r => r.sub)).toEqual(['AL East', 'AL Central', 'AL West']);
    expect(al.wildCards.filter(r => r.inSpot).length).toBe(2);
  });

  it('1985: no Wild Card — the feed’s ranks are ignored and only the two division winners are shown', () => {
    const standings = [
      div(AL, 'American League East', [tr(141, 'Toronto Blue Jays', 99, 62, { dr: 1 }), tr(147, 'New York Yankees', 97, 64, { dr: 2 })]),
      div(AL, 'American League West', [tr(118, 'Kansas City Royals', 91, 71, { dr: 1 }), tr(108, 'California Angels', 90, 72, { dr: 2 })]),
      div(NL, 'National League East', [tr(138, 'St. Louis Cardinals', 101, 61, { dr: 1 })]),
      div(NL, 'National League West', [tr(119, 'Los Angeles Dodgers', 95, 67, { dr: 1 })])
    ];
    // MLB still ranks the non-winners in 1985 — those ranks must not become "Wild Cards".
    const wc = [league(AL, [tr(147, 'New York Yankees', 97, 64, { wcr: 1 }), tr(108, 'California Angels', 90, 72, { wcr: 2 })])];
    const v = buildWildCardView(1985, standings, wc);
    expect(v.format.spots).toBe(0);
    expect(v.wildCardMissing).toBeFalse();
    for (const lg of v.leagues) expect(lg.wildCards).toEqual([]);
    expect(v.leagues[0].leaders.map(r => r.teamName)).toEqual(['Toronto Blue Jays', 'Kansas City Royals']);
    expect(v.leagues[1].leaders.map(r => r.teamName)).toEqual(['St. Louis Cardinals', 'Los Angeles Dodgers']);
  });

  it('before 1969: one pennant winner per league (no divisions)', () => {
    const standings = [
      league(AL, [tr(113, 'Cleveland Indians', 93, 61, { lr: 2 }), tr(147, 'New York Yankees', 96, 58, { lr: 1 })]),
      league(NL, [tr(119, 'Brooklyn Dodgers', 98, 55, { lr: 1 }), tr(144, 'Milwaukee Braves', 85, 69, { lr: 2 })])
    ];
    const v = buildWildCardView(1955, standings, null);
    expect(v.format.spots).toBe(0);
    expect(v.leagues.map(l => l.leaders.map(r => `${r.teamName}/${r.sub}`))).toEqual([
      ['New York Yankees/Pennant winner'], ['Brooklyn Dodgers/Pennant winner']
    ]);
  });

  it('1994: three divisions are shown but no Wild Card team is named', () => {
    const standings = [
      div(AL, 'American League East', [tr(147, 'New York Yankees', 70, 43, { dr: 1 })]),
      div(AL, 'American League Central', [tr(145, 'Chicago White Sox', 67, 46, { dr: 1 })]),
      div(AL, 'American League West', [tr(140, 'Texas Rangers', 52, 62, { dr: 1 })])
    ];
    const v = buildWildCardView(1994, standings, null);
    expect(v.leagues.length).toBe(1);
    expect(v.leagues[0].leaders.length).toBe(3);
    expect(v.leagues[0].wildCards).toEqual([]);
    expect(v.wildCardMissing).toBeFalse();
  });

  it('flags a Wild Card season whose Wild Card feed failed to load', () => {
    expect(buildWildCardView(2025, standings2025, null).wildCardMissing).toBeTrue();
    expect(buildWildCardView(2025, standings2025, [league(AL, wc2025[0].teamRecords)]).wildCardMissing).toBeTrue();   // NL missing
    expect(buildWildCardView(2025, standings2025, wc2025).wildCardMissing).toBeFalse();
  });

  it('copes with empty or unknown-league records', () => {
    expect(buildWildCardView(2025, [], []).leagues).toEqual([]);
    expect(buildWildCardView(2025, [div({ id: 999 }, 'Other', [tr(1, 'X', 1, 1)])], []).leagues).toEqual([]);
  });
});
