import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MlbApiService } from '../../shared/mlb-api.service';
import { LeagueDef, LeagueGroup, leagueById, leagueGroups } from '../../shared/leagues';
import { TeamDataService } from '../../shared/team-data.service';
import { SeoService } from '../../shared/seo.service';
import { BracketModel, ProjectedSeeds, TeamInfo, TeamResolver, buildBracket, makeTeamResolver } from '../bracket/bracket-model';
import { WcView, buildWildCardView, wildCardFormat } from './wild-card-format';
import { LeagueTable, NoDivisionsNotice, buildLeagueTables, noDivisionsNotice } from './division-format';
import { LeagueProfile, latestSeason, leagueProfile, seasonLabel, seasonsFor } from '../league/league-profile';
import { LeagueBundle, LeagueStandingsService, Period } from '../league/league-standings.service';
import { LgStandingsView } from '../league/league-standings-model';
import { QualifyingCut, RulesNote, describePostseason, formatRules, qualifyingCut } from '../league/league-format';

/** Tabs for every league except MLB — each is offered only when the league has that data. */
type LgTab = 'TABLE' | 'DIV' | 'POST';

interface TeamRow {
  teamId: number; teamName: string;
  wins: number; losses: number; pct: string;
  gb: string; wcGb?: string; rank: number; wcRank?: number;
  divisionLeader?: boolean;
  divisionShortName?: string;
  /** 1-6 postseason seed within its league, set only on bracket-seed lists. */
  seed?: number;
}

interface Division {
  name: string; shortName: string; teams: TeamRow[];
}

@Component({
  selector: 'app-standings',
  templateUrl: './standings.component.html',
  styleUrl: './standings.component.scss',
  standalone: false
})
export class StandingsComponent implements OnInit, OnDestroy {
  activeTab: 'DIV' | 'WC' | 'BRACKET' = 'DIV';
  loading = true;

  alDivisions: Division[] = [];
  nlDivisions: Division[] = [];
  alDivisionLeaders: TeamRow[] = [];
  nlDivisionLeaders: TeamRow[] = [];
  alWildCard: TeamRow[] = [];
  nlWildCard: TeamRow[] = [];

  /** Division tab for seasons before divisions existed (1901–1968): a notice and one table per league. */
  divNotice: NoDivisionsNotice | null = null;
  leagueTables: LeagueTable[] = [];

  /** Wild Card tab: what that season's format was (0–3 Wild Cards per league) and the rows to draw. */
  wcView: WcView | null = null;

  /** Seeds 1-6 per league from the current standings: the 3 division leaders (by record)
   *  followed by the 3 wild card teams (by wcRank). Only used to project the bracket
   *  before MLB has scheduled any postseason series. */
  alSeeds: TeamRow[] = [];
  nlSeeds: TeamRow[] = [];

  /** Postseason Bracket tab: built from MLB's postseason series feed for the selected season,
   *  so each year shows the teams and the format (rounds, best-of lengths, byes) that year used. */
  bracketModel: BracketModel | null = null;
  bracketLoading = false;
  bracketError = false;
  private bracketCache = new Map<number, BracketModel>();
  private teamInfo = new Map<number, TeamInfo>();
  private resolveTeam: TeamResolver;
  private bracketTimer: ReturnType<typeof setTimeout> | null = null;

  season = new Date().getFullYear();
  /** Years available in the season picker (descending). Standings begin in 1901 (modern AL/NL era). */
  readonly years: number[] = (() => {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now; y >= 1901; y--) out.push(y);
    return out;
  })();

  /* ───────── league selector ───────── */

  readonly leagueGroups: LeagueGroup[] = leagueGroups();
  /** The league on show. MLB keeps its own page (above); every other league is drawn from its feed (below). */
  league: LeagueDef = leagueById('mlb')!;
  /** What the season picker lists for the selected league. */
  seasonOptions: number[] = this.years;
  private profile: LeagueProfile | null = null;
  /** Each league remembers the season the visitor last looked at. */
  private seasonMemory = new Map<string, number>();

  lg: LeagueBundle | null = null;
  lgLoading = false;
  lgError = false;
  lgTab: LgTab = 'TABLE';
  lgTabs: Array<{ id: LgTab; label: string }> = [];
  lgPeriod: Period = 'full';
  /** Clubs that played in the league's postseason / won a bracket — marked in the tables. */
  qualified = new Set<number>();
  champs = new Set<number>();
  /** NPB-style cut line (top N of the table reach the postseason by record alone). */
  cut: QualifyingCut | null = null;
  /** The league's confirmed postseason rules, and the outline of the postseason the feed actually played. */
  rules: RulesNote | null = null;
  outline: string[] = [];
  legend: Array<{ badge: string; text: string; kind: 'champ' | 'po' | 'cut' }> = [];
  private lgSub: Subscription | null = null;
  private lgTimer: ReturnType<typeof setTimeout> | null = null;
  /** The season was picked automatically (newest) — step back if it has no data yet. */
  private autoSeason = false;
  private fallbacksLeft = 0;

  constructor(
    private api: MlbApiService,
    public teams: TeamDataService,
    private router: Router,
    private route: ActivatedRoute,
    private seo: SeoService,
    private leagues: LeagueStandingsService
  ) {
    this.resolveTeam = makeTeamResolver(this.teams);
  }

  get isMlb(): boolean { return this.league.id === 'mlb'; }

  /** The standings table set for the selected half (or full season). */
  get lgView(): LgStandingsView | null {
    return this.lg ? (this.lg.views[this.lgPeriod] ?? this.lg.views.full ?? null) : null;
  }

  ngOnInit() {
    const wanted = leagueById(this.route.snapshot.queryParamMap.get('league') ?? '');
    if (wanted) this.league = wanted;
    this.applyLeague();
  }

  ngOnDestroy() {
    this.stopBracketRefresh();
    this.stopLeagueRefresh();
    this.lgSub?.unsubscribe();
  }

  selectLeague(id: string) {
    const next = leagueById(id);
    if (!next || next.id === this.league.id) return;
    this.seasonMemory.set(this.league.id, this.season);
    this.league = next;
    this.syncUrl();
    this.applyLeague();
  }

  /** Switches the page to `this.league`: picks its seasons and loads it. */
  private applyLeague() {
    this.stopBracketRefresh();
    this.stopLeagueRefresh();
    this.lgSub?.unsubscribe();
    this.profile = leagueProfile(this.league.id);
    const remembered = this.seasonMemory.get(this.league.id);

    if (!this.profile) {
      this.seo.update(
        'MLB Standings — AL & NL Division and Wild Card Standings | Baseball Nerd',
        'Current MLB standings for the American and National League, updated daily with wins, losses, games behind, run differential, and separate wild card tracking.'
      );
      this.seasonOptions = this.years;
      this.season = remembered ?? new Date().getFullYear();
      this.resetMlbData();
      this.loadStandings();
      return;
    }

    this.seo.update(
      `${this.league.name} Standings | Baseball Nerd`,
      `${this.league.name} (${this.league.region}) standings with wins, losses and games behind by season, plus divisions and the postseason bracket where the league has them.`
    );
    const now = new Date();
    this.seasonOptions = seasonsFor(this.profile, now);
    this.season = remembered ?? latestSeason(this.profile, now);
    this.autoSeason = remembered == null;
    this.fallbacksLeft = this.autoSeason ? 2 : 0;
    this.lg = null;
    this.lgTabs = [];
    this.lgPeriod = 'full';
    this.syncPostseasonInfo();
    this.loadLeague();
  }

  private syncUrl() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { league: this.isMlb ? null : this.league.id },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  /** "2025" — or "2025–26" for the winter leagues. */
  seasonText(year: number): string {
    return this.profile ? seasonLabel(this.profile, year) : String(year);
  }

  loadLeague() {
    const p = this.profile;
    if (!p) return;
    const season = this.season;
    const leagueId = this.league.id;
    this.stopLeagueRefresh();
    this.lgSub?.unsubscribe();
    this.lgLoading = true;
    this.lgError = false;
    this.lgSub = this.leagues.load(p, season).subscribe({
      next: (bundle) => {
        if (season !== this.season || leagueId !== this.league.id) return;
        this.applyBundle(bundle, p);
      },
      error: () => {
        if (season !== this.season || leagueId !== this.league.id) return;
        this.lgLoading = false;
        this.lgError = true;
      }
    });
  }

  private applyBundle(bundle: LeagueBundle, p: LeagueProfile) {
    const standings = bundle.views.full!;
    const hasPostseason = !!bundle.postseason && bundle.postseason.games > 0;

    // The newest season may not have started (or the league may be between seasons): step back once or twice.
    if (!standings.blocks.length && !hasPostseason && this.autoSeason && this.fallbacksLeft > 0 && this.season > p.firstSeason) {
      this.fallbacksLeft--;
      this.season--;
      this.loadLeague();
      return;
    }
    this.autoSeason = false;

    this.lg = bundle;
    this.lgLoading = false;
    if (!bundle.periods.includes(this.lgPeriod)) this.lgPeriod = 'full';
    this.syncPostseasonInfo();
    this.refreshLgTabs();
    this.scheduleLeagueRefresh();
  }

  private refreshLgTabs() {
    const b = this.lg;
    const tabs: Array<{ id: LgTab; label: string }> = [];
    if (b) {
      const v = b.views.full!;
      if (v.blocks.length) tabs.push({ id: 'TABLE', label: 'Standings' });
      if (v.hasDivisions) tabs.push({ id: 'DIV', label: 'Divisions' });
      if (b.postseason && b.postseason.games > 0) tabs.push({ id: 'POST', label: 'Postseason' });
    }
    this.lgTabs = tabs;
    if (tabs.length && !tabs.some(t => t.id === this.lgTab)) this.lgTab = tabs[0].id;
  }

  /** Works out the markers, legend, rules note and postseason outline for the league and season on show. */
  private syncPostseasonInfo() {
    const ps = this.lg?.postseason ?? null;
    // a projection hasn't been played: it marks nobody and has no outline of its own
    const projected = this.lg?.postseasonSource?.kind === 'projected';
    this.qualified = new Set(projected ? [] : (ps?.teams ?? []).map(t => t.id));
    this.champs = new Set(projected ? [] : (ps?.champions ?? []).map(t => t.id));
    this.cut = this.profile ? qualifyingCut(this.league.id, this.season) : null;
    this.rules = this.profile ? formatRules(this.league.id, this.season) : null;
    this.outline = ps && !projected ? describePostseason(ps) : [];

    const legend: Array<{ badge: string; text: string; kind: 'champ' | 'po' | 'cut' }> = [];
    if (this.champs.size) legend.push({ badge: 'CHAMP', kind: 'champ', text: 'won its postseason bracket' });
    if (this.qualified.size) legend.push({ badge: 'PO', kind: 'po', text: 'played in the postseason' });
    // once the postseason has been played, PO already says who qualified — the cut badge would only repeat it
    if (this.cut && !this.qualified.size) legend.push({ badge: this.cut.badge, kind: 'cut', text: this.cut.legend });
    this.legend = legend;
  }

  /** True when the row's club is in a Climax Series-style place by record (rank within the cut) and hasn't yet been marked PO/CHAMP. */
  inCut(rank: number, teamId: number): boolean {
    return !!this.cut && rank > 0 && rank <= this.cut.spots && !this.qualified.has(teamId);
  }

  setLgTab(tab: LgTab) {
    this.lgTab = tab;
    this.scheduleLeagueRefresh();
  }

  setPeriod(period: Period) {
    this.lgPeriod = period;
  }

  periodLabel(p: Period): string {
    return p === 'first' ? 'First half' : p === 'second' ? 'Second half' : 'Full season';
  }

  /** Keeps an unfinished postseason fresh while it's on screen. */
  private scheduleLeagueRefresh() {
    this.stopLeagueRefresh();
    const p = this.profile;
    const b = this.lg;
    if (typeof window === 'undefined' || !p || !b || this.lgTab !== 'POST' || !b.postseason?.pending) return;
    if (b.postseasonSource) return;      // entered by hand or projected: there is no feed to poll
    if (this.season < latestSeason(p, new Date())) return;
    const season = this.season;
    this.lgTimer = setTimeout(() => {
      this.leagues.postseason(p, season, b.leagueIds).subscribe(view => {
        if (season !== this.season || this.lg !== b || !view) { if (this.lg === b) this.scheduleLeagueRefresh(); return; }
        this.lg = { ...b, postseason: view };
        this.syncPostseasonInfo();
        this.refreshLgTabs();
        this.scheduleLeagueRefresh();
      });
    }, 60_000);
  }

  private stopLeagueRefresh() {
    if (this.lgTimer) { clearTimeout(this.lgTimer); this.lgTimer = null; }
  }

  /** Stable per-team colour for the initials badge (these clubs' logos aren't on the MLB CDN). */
  badgeColor(teamId: number): string {
    return `hsl(${((teamId ?? 0) * 47) % 360}, 48%, 34%)`;
  }

  /** "Oct 8, 2026" for a YYYY-MM-DD date (read as a calendar date, not shifted by the viewer's time zone). */
  throughLabel(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  lgTeamCount(v: LgStandingsView): number {
    return v.blocks.reduce((n, b) => n + b.table.length, 0);
  }

  trackByTeam(_: number, t: { teamId: number }) { return t.teamId; }
  trackByLeague(_: number, b: { leagueId: number; name: string }) { return `${b.leagueId}:${b.name}`; }

  goToTeam(teamId: number) {
    if (teamId) this.router.navigate(['/team-schedule', teamId]);
  }

  setTab(tab: 'DIV' | 'WC' | 'BRACKET') {
    this.activeTab = tab;
    if (tab === 'BRACKET') this.loadBracket();
    else this.stopBracketRefresh();
  }

  selectSeason(year: number) {
    if (this.season === year) return;
    this.season = year;
    this.autoSeason = false;
    if (!this.isMlb) { this.loadLeague(); return; }
    this.resetMlbData();
    this.loadStandings();
  }

  /** Clears the MLB tabs' data so the old standings don't flash while loading. */
  private resetMlbData() {
    this.alDivisions = [];
    this.nlDivisions = [];
    this.alDivisionLeaders = [];
    this.nlDivisionLeaders = [];
    this.alWildCard = [];
    this.nlWildCard = [];
    this.wcView = null;
    this.divNotice = null;
    this.leagueTables = [];
    this.alSeeds = [];
    this.nlSeeds = [];
    this.bracketModel = null;
    this.bracketError = false;
    this.stopBracketRefresh();
  }

  trackByYear(_: number, y: number) { return y; }

  loadStandings() {
    this.loading = true;
    const season = this.season;
    this.api.getStandings(season).subscribe({
      next: (data) => {
        if (season !== this.season) return;
        const records = data.records || [];
        this.collectTeamInfo(records);
        this.buildDivisions(records);
        this.divNotice = noDivisionsNotice(season);
        this.leagueTables = this.divNotice ? buildLeagueTables(records) : [];

        // Seasons without a Wild Card have nothing to fetch — the tab just says so.
        if (wildCardFormat(season).spots === 0) {
          this.wcView = buildWildCardView(season, records, null);
          this.loading = false;
          if (this.activeTab === 'BRACKET') this.loadBracket();
          return;
        }
        this.api.getWildCard(season).subscribe({
          next: (wc) => {
            if (season !== this.season) return;
            this.buildWildCard(wc.records || []);
            this.wcView = buildWildCardView(season, records, wc.records || []);
            this.alSeeds = this.buildBracketSeeds(this.alDivisionLeaders, this.alWildCard);
            this.nlSeeds = this.buildBracketSeeds(this.nlDivisionLeaders, this.nlWildCard);
            this.loading = false;
            if (this.activeTab === 'BRACKET') this.loadBracket();
          },
          error: () => {
            if (season !== this.season) return;
            this.wcView = buildWildCardView(season, records, null);
            this.loading = false;
            if (this.activeTab === 'BRACKET') this.loadBracket();
          }
        });
      },
      error: () => { if (season !== this.season) return; this.loading = false; if (this.activeTab === 'BRACKET') this.loadBracket(); }
    });
  }

  /** Per-team league / division rank / win% for the season — used to place teams in the bracket. */
  private collectTeamInfo(records: any[]) {
    const info = new Map<number, TeamInfo>();
    for (const rec of records) {
      const lg = rec.league?.id === 103 ? 'AL' : rec.league?.id === 104 ? 'NL' : null;
      for (const tr of rec.teamRecords || []) {
        const id = tr.team?.id;
        if (!id) continue;
        info.set(id, {
          league: lg,
          divisionRank: parseInt(tr.divisionRank, 10) || 0,
          pct: parseFloat(tr.winningPercentage) || 0
        });
      }
    }
    this.teamInfo = info;
  }

  /** (Re)loads the postseason series for the selected season and rebuilds the bracket. */
  loadBracket(force = false) {
    if (this.loading) return;   // called again as soon as the standings finish loading
    const season = this.season;
    const cached = this.bracketCache.get(season);
    if (cached && !force && !this.isInProgress(cached)) {
      this.bracketModel = cached;
      this.bracketError = false;
      return;
    }
    if (cached && !this.bracketModel) this.bracketModel = cached;
    if (!this.bracketModel) this.bracketLoading = true;
    this.bracketError = false;

    this.api.getPostseasonSeries(season).subscribe({
      next: (res) => {
        if (season !== this.season) return;
        const model = buildBracket({
          season,
          series: res?.series ?? [],
          info: this.teamInfo,
          resolve: this.resolveTeam,
          projected: this.projectedSeeds()
        });
        this.bracketCache.set(season, model);
        this.bracketModel = model;
        this.bracketLoading = false;
        this.scheduleBracketRefresh(model);
      },
      error: () => {
        if (season !== this.season) return;
        this.bracketLoading = false;
        this.bracketError = !this.bracketModel;   // a failed background refresh keeps the last bracket
      }
    });
  }

  /** True while the selected season's World Series hasn't been decided. */
  private isInProgress(model: BracketModel): boolean {
    return model.season >= new Date().getFullYear() && model.kind !== 'none' && model.roots.WS?.winner == null;
  }

  private scheduleBracketRefresh(model: BracketModel) {
    this.stopBracketRefresh();
    if (typeof window === 'undefined' || this.activeTab !== 'BRACKET' || !this.isInProgress(model)) return;
    this.bracketTimer = setTimeout(() => this.loadBracket(true), 60_000);
  }

  private stopBracketRefresh() {
    if (this.bracketTimer) { clearTimeout(this.bracketTimer); this.bracketTimer = null; }
  }

  private projectedSeeds(): ProjectedSeeds | null {
    if (this.alSeeds.length !== 6 || this.nlSeeds.length !== 6) return null;
    const conv = (rows: TeamRow[]) => rows.map(r => this.resolveTeam(r.teamId, r.teamName));
    return { AL: conv(this.alSeeds), NL: conv(this.nlSeeds) };
  }

  buildDivisions(records: any[]) {
    const leagueAbbr: Record<number, string> = { 103: 'AL', 104: 'NL' };
    const divMap: Record<string, Division> = {};

    records.forEach(rec => {
      const lg = leagueAbbr[rec.league?.id];
      if (!lg) return;
      const divName = rec.division?.name || 'Unknown';
      const short = divName.replace('American League ', 'AL ').replace('National League ', 'NL ');
      if (!divMap[divName]) divMap[divName] = { name: divName, shortName: short, teams: [] };
      (rec.teamRecords || []).forEach((tr: any) => {
        divMap[divName].teams.push({
          teamId: tr.team?.id, teamName: tr.team?.name,
          wins: tr.wins, losses: tr.losses,
          pct: tr.winningPercentage, gb: tr.gamesBack,
          rank: parseInt(tr.divisionRank) || 0,
          wcGb: tr.wildCardGamesBack,
        });
      });
      divMap[divName].teams.sort((a, b) => a.rank - b.rank);
    });

    const alOrder = ['American League East','American League Central','American League West'];
    const nlOrder = ['National League East','National League Central','National League West'];
    this.alDivisions = alOrder.map(n => divMap[n]).filter(Boolean);
    this.nlDivisions = nlOrder.map(n => divMap[n]).filter(Boolean);

    // Extract the rank-1 team from each division for the Wild Card tab,
    // ordered by winning percentage (not division order) — this is what
    // actually determines seeds 1-3 in the postseason bracket.
    const byPctDesc = (a: TeamRow, b: TeamRow) => parseFloat(b.pct) - parseFloat(a.pct);

    this.alDivisionLeaders = this.alDivisions
      .map(div => ({ ...div.teams[0], divisionShortName: div.shortName }))
      .filter(Boolean)
      .sort(byPctDesc);
    this.nlDivisionLeaders = this.nlDivisions
      .map(div => ({ ...div.teams[0], divisionShortName: div.shortName }))
      .filter(Boolean)
      .sort(byPctDesc);
  }

  buildWildCard(records: any[]) {
    const leagueAbbr: Record<number, string> = { 103: 'AL', 104: 'NL' };
    const al: TeamRow[] = [], nl: TeamRow[] = [];
    records.forEach(rec => {
      const lg = leagueAbbr[rec.league?.id];
      (rec.teamRecords || []).forEach((tr: any) => {
        const row: TeamRow = {
          teamId: tr.team?.id, teamName: tr.team?.name,
          wins: tr.wins, losses: tr.losses,
          pct: tr.winningPercentage, gb: tr.gamesBack,
          wcGb: tr.wildCardGamesBack,
          rank: 0, wcRank: parseInt(tr.wildCardRank) || 99
        };
        if (lg === 'AL') al.push(row); else nl.push(row);
      });
    });
    this.alWildCard = al.sort((a, b) => (a.wcRank ?? 99) - (b.wcRank ?? 99));
    this.nlWildCard = nl.sort((a, b) => (a.wcRank ?? 99) - (b.wcRank ?? 99));
  }

  /** Combines the 3 division leaders (seeds 1-3, already ordered by record)
   *  with the top 3 wild card teams (seeds 4-6, already ordered by
   *  wcRank) into one 1-6 seed list for the bracket. Returns [] rather
   *  than a partial list if either side is short a team — a half-built
   *  bracket is worse than a clear "not enough data yet" state. */
  private buildBracketSeeds(divisionLeaders: TeamRow[], wildCard: TeamRow[]): TeamRow[] {
    if (divisionLeaders.length !== 3) return [];
    const topWc = wildCard
      .filter(t => (t.wcRank ?? 99) <= 3)
      .sort((a, b) => (a.wcRank ?? 99) - (b.wcRank ?? 99));
    if (topWc.length !== 3) return [];
    return [...divisionLeaders, ...topWc].map((t, i) => ({ ...t, seed: i + 1 }));
  }

  isGbLeader(gb: string) { return gb === '-' || gb === '0.0' || gb === '0'; }
  logoError(ev: Event)   { (ev.target as HTMLImageElement).style.display = 'none'; }
}
