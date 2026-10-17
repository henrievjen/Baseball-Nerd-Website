/**
 * Geometry for the bracket. Everything is in "design units" on a canvas that is
 * 2·R + 256 wide (1536 for the 12-team format — the same proportions as MLB's
 * Postseason Picture graphic); the component scales units to pixels with CSS.
 *
 * Rows are measured in diamond pitches (1 row = 120 units). A series is two
 * stacked slots; the winner's slot in the next round sits halfway between them,
 * so every connector is a simple bracket and slots land on a half-row grid.
 *
 * Coordinates for a league are "local": x runs from the league's OUTER edge
 * toward the World Series, so the National League is just mirrored by the view.
 */
import { BColumn, BNode, BSlot, BracketModel, League, Round } from './bracket-model';

export const PITCH = 120;
export const DIAMOND = 112;
export const HALF = DIAMOND / 2;
export const COL_W = 640 / 3;
export const CENTER_W = 256;
/** Height of the centre block (World Series cluster + wordmark + pill) and where its diamonds sit. */
export const CENTER_H = 540;
export const WS_Y = 240;

export interface PlacedSlot {
  key: string;
  round: Round;
  slot: BSlot;
  x: number;
  y: number;
  /** True where the team enters the bracket (shows its seed badge). */
  entering: boolean;
}

export interface TextAt { x: number; y: number; text: string; }

export interface LeagueLayout {
  league: League;
  slots: PlacedSlot[];
  paths: string[];
  statuses: (TextAt & { wide: boolean; key: string })[];
  labels: (TextAt & { sub: string })[];
  pills: TextAt[];
}

export interface CenterLayout {
  /** Canvas y of the block's top edge (the block is CENTER_W × height). */
  top: number;
  height: number;
  /** Block-local coordinates. */
  champion: { x: number; y: number; slot: BSlot | null };
  championLabel: TextAt | null;
  slots: PlacedSlot[];
  path: string;
  status: TextAt | null;
  wordmark: TextAt;
  pill: TextAt;
}

export interface BracketLayout {
  width: number;
  height: number;
  /** Width of one league zone (0 columns → a small margin). */
  R: number;
  /** Columns per league (0–3). */
  columns: number;
  /** Units used for the stacked (narrow screen) layout. */
  stackUnits: number;
  AL: LeagueLayout | null;
  NL: LeagueLayout | null;
  center: CenterLayout;
}

interface Sub {
  rows: Map<BNode, [number, number]>;
  root: [number, number];
  min: number;
  max: number;
}

const mid = (r: [number, number]) => (r[0] + r[1]) / 2;

/** Row positions (relative) for every slot in the tree under `n`. */
export function measure(n: BNode): Sub {
  const [f0, f1] = n.feeders;
  const a = f0 ? measure(f0) : null;
  const b = f1 ? measure(f1) : null;
  const rows = new Map<BNode, [number, number]>();
  let root: [number, number];
  let min: number, max: number;

  if (a && b) {
    // Two feeding subtrees stack top/bottom; the gap is wider under a Championship Series
    // so the round label fits between the two halves (as in MLB's graphic).
    const gap = n.round === 'L' ? 1.7 : 1.3;
    const shift = a.max - b.min + gap;
    a.rows.forEach((v, k) => rows.set(k, v));
    b.rows.forEach((v, k) => rows.set(k, [v[0] + shift, v[1] + shift]));
    root = [mid(a.root), mid(b.root) + shift];
    min = Math.min(a.min, b.min + shift);
    max = Math.max(a.max, b.max + shift);
  } else if (a || b) {
    // One feeder + one team entering here (a bye): the entrant sits one row beside the winner's slot.
    const s = (a ?? b)!;
    const feederIdx = a ? 0 : 1;
    s.rows.forEach((v, k) => rows.set(k, v));
    const m = mid(s.root);
    root = feederIdx === 0 ? [m, m + 1] : [m - 1, m];
    min = Math.min(s.min, root[0]);
    max = Math.max(s.max, root[1]);
  } else {
    // Two teams entering: a Championship Series is spread out to leave room for its label.
    const spacing = n.round === 'L' ? 3.2 : 1;
    root = [0, spacing];
    min = 0;
    max = spacing;
  }
  rows.set(n, root);
  return { rows, root, min, max };
}

/** Finds a y near `target` that is at least `clear` away from every obstacle. */
function freeY(obstacles: number[], target: number, clear: number, lo: number, hi: number): number {
  const ok = (y: number) => y >= lo && y <= hi && obstacles.every(v => Math.abs(v - y) >= clear);
  if (ok(target)) return target;
  for (let d = 4; d <= 800; d += 4) {
    if (ok(target - d)) return target - d;
    if (ok(target + d)) return target + d;
  }
  return target;
}

const colX = (i: number) => (i + 0.5) * COL_W;

export function layoutBracket(model: BracketModel): BracketLayout | null {
  if (model.kind === 'none' || !model.roots.WS) return null;

  const k = Math.max(model.columns.AL.length, model.columns.NL.length);
  const R = k ? k * COL_W : 32;
  const width = k ? 2 * R + CENTER_W : CENTER_W + 2 * R;

  const leagues = (['AL', 'NL'] as League[])
    .map(L => ({ L, root: model.roots[L], cols: model.columns[L] }))
    .filter((x): x is { L: League; root: BNode; cols: BColumn[] } => !!x.root && x.cols.length > 0)
    .map(x => ({ ...x, sub: measure(x.root) }));

  // Vertical extent: centred on the Championship Series midpoint so both leagues meet the World Series at one height.
  let half = Math.max(WS_Y, CENTER_H - WS_Y);
  for (const lg of leagues) {
    const csMid = mid(lg.sub.root);
    half = Math.max(half, (csMid - lg.sub.min) * PITCH + HALF + 36, (lg.sub.max - csMid) * PITCH + HALF + 90);
  }
  const height = 2 * half;
  const Hmid = half;

  const layoutLeague = (lg: (typeof leagues)[number]): LeagueLayout => {
    const csMid = mid(lg.sub.root);
    const y = (row: number) => Hmid + (row - csMid) * PITCH;
    const colOf = new Map<Round, number>(lg.cols.map((c, i) => [c.round, i]));

    const slots: PlacedSlot[] = [];
    const paths: string[] = [];
    const statuses: LeagueLayout['statuses'] = [];

    for (const [node, [r0, r1]] of lg.sub.rows) {
      const col = colOf.get(node.round);
      if (col == null) continue;
      const x = colX(col);
      const y0 = y(r0), y1 = y(r1), ym = (y0 + y1) / 2;
      const isRoot = node === lg.root;

      node.slots.forEach((slot, i) => {
        slots.push({ key: `${node.key}:${i}`, round: node.round, slot, x, y: i === 0 ? y0 : y1, entering: !node.feeders[i] });
      });

      // Bracket: both slots join a vertical line, which leads to the winner's slot in the next round.
      const xr = x + HALF;
      const xv = isRoot ? R - 15 : x + 124;
      const xEnd = isRoot ? R + 2 : colX(col + 1) - HALF;
      paths.push(`M${xr} ${y0}H${xv}V${y1}H${xr}M${xv} ${ym}H${xEnd}`);

      if (node.statusText && !isRoot) {
        statuses.push({ key: node.key, x: x + 62, y: ym, text: node.statusText, wide: false });
      }
    }

    // Round labels sit in the vertical middle of each column (nudged clear of any diamond).
    const labels: LeagueLayout['labels'] = [];
    const pills: TextAt[] = [];
    lg.cols.forEach((c, i) => {
      const ys = slots.filter(s => s.round === c.round).map(s => s.y);
      const ly = freeY(ys, Hmid, HALF + 46, 60, height - 60);
      labels.push({ x: colX(i), y: ly, text: c.title, sub: c.sub });
      if (ys.length) {
        pills.push({ x: colX(i), y: Math.max(...ys) + HALF + 30, text: c.bestOf === 1 ? 'Single game' : `Best of ${c.bestOf}` });
      }
      if (lg.root.round === c.round && lg.root.statusText) {
        statuses.push({ key: lg.root.key, x: colX(i), y: ly + 78, text: lg.root.statusText, wide: true });
      }
    });

    return { league: lg.L, slots, paths, statuses, labels, pills };
  };

  const ws = model.roots.WS;
  const cx = CENTER_W / 2;
  const wsY = WS_Y;
  const wsSlots: PlacedSlot[] = ws.slots.map((slot, i) => ({
    key: `${ws.key}:${i}`, round: 'W' as Round, slot, x: cx + (i === 0 ? -70 : 70), y: wsY, entering: false
  }));
  const champSlot = ws.winner != null ? ws.slots[ws.winner] : null;

  const center: CenterLayout = {
    top: Hmid - WS_Y,
    height: CENTER_H,
    champion: { x: cx, y: 96, slot: champSlot },
    championLabel: champSlot ? { x: cx, y: 22, text: 'CHAMPIONS' } : null,
    slots: wsSlots,
    path: `M${cx - 70 + HALF} ${wsY}H${cx + 70 - HALF}M${cx} ${wsY}V${96 + HALF}`,
    status: ws.statusText ? { x: cx, y: 326, text: ws.statusText } : null,
    wordmark: { x: cx, y: 404, text: 'WORLD SERIES' },
    pill: { x: cx, y: 500, text: `Best of ${ws.bestOf}` }
  };

  return {
    width, height, R, columns: k,
    stackUnits: Math.max(R, CENTER_W),
    AL: leagues.find(l => l.L === 'AL') ? layoutLeague(leagues.find(l => l.L === 'AL')!) : null,
    NL: leagues.find(l => l.L === 'NL') ? layoutLeague(leagues.find(l => l.L === 'NL')!) : null,
    center
  };
}
