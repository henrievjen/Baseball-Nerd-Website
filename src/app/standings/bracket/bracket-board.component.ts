import { Component, Input, OnChanges } from '@angular/core';
import { Router } from '@angular/router';
import { BSlot, BTeam, BracketModel, League } from './bracket-model';
import { BracketLayout, LeagueLayout, PlacedSlot, layoutBracket } from './bracket-layout';

/**
 * The postseason bracket drawn like MLB's "Postseason Picture": AL on the left, NL on
 * the right, World Series in the middle, a diamond per team. All geometry comes from
 * `layoutBracket` (design units); the stylesheet scales it to the container width and
 * stacks the two leagues on narrow screens.
 */
@Component({
  selector: 'app-bracket-board',
  templateUrl: './bracket-board.component.html',
  styleUrl: './bracket-board.component.scss',
  standalone: false
})
export class BracketBoardComponent implements OnChanges {
  @Input() model: BracketModel | null = null;

  layout: BracketLayout | null = null;
  leagues: { key: League; layout: LeagueLayout }[] = [];
  champion: PlacedSlot | null = null;

  /** Teams whose logo failed to load — they fall back to an initials tile. */
  private failedLogos = new Set<number>();

  constructor(private router: Router) {}

  ngOnChanges(): void {
    this.layout = this.model ? layoutBracket(this.model) : null;
    this.leagues = [];
    this.champion = null;
    if (!this.layout) return;
    if (this.layout.AL) this.leagues.push({ key: 'AL', layout: this.layout.AL });
    if (this.layout.NL) this.leagues.push({ key: 'NL', layout: this.layout.NL });
    const c = this.layout.center.champion;
    const empty: BSlot = { team: null, label: '', seed: '', state: 'open', wins: null };
    this.champion = { key: 'champion', round: 'W', slot: c.slot ?? empty, x: c.x, y: c.y, entering: false };
  }

  showLogo(t: BTeam | null | undefined): boolean {
    return !!t && !!t.logo && !this.failedLogos.has(t.id);
  }

  logoError(t: BTeam | null | undefined): void {
    if (t) this.failedLogos.add(t.id);
  }

  open(t: BTeam | null | undefined): void {
    if (t?.clickable) this.router.navigate(['/team-schedule', t.id]);
  }

  slotTitle(s: PlacedSlot): string {
    const t = s.slot.team;
    if (!t) return s.slot.label || 'To be determined';
    return t.name + (s.slot.seed ? (s.slot.seed === 'WC' ? ' · Wild Card' : ` · seed ${s.slot.seed}`) : '');
  }

  isNumeric(seed: string): boolean { return /^\d+$/.test(seed); }

  /** "CHW wins 2-0" → ["CHW wins", "2-0"] so the score never breaks at its hyphen. */
  statusLines(text: string): string[] {
    const m = /^(.*\S)\s+(\d+-\d+)$/.exec(text);
    return m ? [m[1], m[2]] : [text];
  }

  trackSlot(_: number, s: PlacedSlot): string { return s.key; }
}
