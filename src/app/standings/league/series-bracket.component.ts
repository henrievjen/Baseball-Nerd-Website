import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { PsBracket, PsSeries, PsTeam, PsView } from './league-postseason-model';

/**
 * Postseason board for the non-MLB leagues: round-robin tables first, then one
 * bracket (rounds left → right) for every group of linked series.
 */
@Component({
  selector: 'app-series-bracket',
  templateUrl: './series-bracket.component.html',
  styleUrl: './series-bracket.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class SeriesBracketComponent {
  @Input({ required: true }) view!: PsView;

  /** Stable per-team colour for the initials badge (these clubs have no logo on the MLB CDN). */
  badgeColor(t: PsTeam): string {
    return `hsl(${(t.id * 47) % 360}, 48%, 34%)`;
  }

  format(s: PsSeries): string {
    const kind = s.bestOf <= 1 ? 'Single game' : `Best of ${s.bestOf}`;
    if (s.advanced) return `${kind} · Split ${s.score[0]}–${s.score[1]} · advanced`;
    return s.status === 'final' ? `${kind} · Final` : s.status === 'live' ? `${kind} · In progress` : `${kind} · Upcoming`;
  }

  trackSeries(_: number, s: PsSeries) { return s.key; }
  trackBracket(i: number, b: PsBracket) { return b.title ?? i; }
}
