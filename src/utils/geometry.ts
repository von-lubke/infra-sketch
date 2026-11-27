import { GRID_SIZE } from '../data/catalog';
import {
  AnchorSide,
  DiagramDocument,
  EndpointKind,
  InfraEdge,
  InfraGroup,
  InfraNode,
  InfraText,
  Selection,
} from '../types/diagram';

export interface Point {
  x: number;
  y: number;
}

export interface RectBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function snapValue(val: number, enabled: boolean, grid = GRID_SIZE): number {
  if (!enabled) return Math.round(val);
  return Math.round(val / grid) * grid;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2147483640) + 1;
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function rectIntersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

export function resolveEdgeEndpoint(
  doc: Pick<DiagramDocument, 'nodes' | 'groups'>,
  id: string,
  kind: EndpointKind = 'node'
): RectBox | null {
  if (kind === 'group') {
    return doc.groups.find((g) => g.id === id) ?? null;
  }
  return doc.nodes.find((n) => n.id === id) ?? doc.groups.find((g) => g.id === id) ?? null;
}

export function getAnchorPoint(box: Pick<RectBox, 'x' | 'y' | 'width' | 'height'>, side: AnchorSide): Point {
  switch (side) {
    case 'top':
      return { x: box.x + box.width / 2, y: box.y };
    case 'right':
      return { x: box.x + box.width, y: box.y + box.height / 2 };
    case 'bottom':
      return { x: box.x + box.width / 2, y: box.y + box.height };
    case 'left':
      return { x: box.x, y: box.y + box.height / 2 };
  }
}

export function getAnchorDirection(side: AnchorSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
  }
}

export function pickClosestAnchor(
  box: Pick<RectBox, 'x' | 'y' | 'width' | 'height'>,
  target: Point
): AnchorSide {
  const sides: AnchorSide[] = ['top', 'right', 'bottom', 'left'];
  let best: AnchorSide = 'left';
  let bestDist = Infinity;

  for (const side of sides) {
    const pt = getAnchorPoint(box, side);
    const d = Math.hypot(pt.x - target.x, pt.y - target.y);
    if (d < bestDist) {
      bestDist = d;
      best = side;
    }
  }
  return best;
}

export function pickBestAnchorPair(
  source: Pick<RectBox, 'x' | 'y' | 'width' | 'height'>,
  target: Pick<RectBox, 'x' | 'y' | 'width' | 'height'>
): { sourceAnchor: AnchorSide; targetAnchor: AnchorSide } {
  const scx = source.x + source.width / 2;
  const scy = source.y + source.height / 2;
  const tcx = target.x + target.width / 2;
  const tcy = target.y + target.height / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceAnchor: 'right', targetAnchor: 'left' }
      : { sourceAnchor: 'left', targetAnchor: 'right' };
  }
  return dy >= 0
    ? { sourceAnchor: 'bottom', targetAnchor: 'top' }
    : { sourceAnchor: 'top', targetAnchor: 'bottom' };
}

export interface EdgeGeometry {
  start: Point;
  end: Point;
  c1: Point;
  c2: Point;
  points: Point[];
  midpoint: Point;
  endAngle: number;
  startAngle: number;
  svgPath: string;
}

function cleanOrthogonalPoints(raw: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const pt of raw) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.5) {
      deduped.push(pt);
    }
  }
  if (deduped.length <= 2) return deduped;

  const simplified: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const a = simplified[simplified.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];
    const sameX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
    const sameY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
    if (!sameX && !sameY) {
      simplified.push(b);
    }
  }
  simplified.push(deduped[deduped.length - 1]);
  return simplified;
}

function polylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  let total = 0;
  const segLengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segLengths.push(len);
    total += len;
  }
  if (total === 0) return points[0];

  let target = total / 2;
  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i];
    if (target <= len || i === segLengths.length - 1) {
      const t = len > 0 ? target / len : 0;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    target -= len;
  }
  return points[0];
}

function buildOrthogonalPoints(
  start: Point,
  sourceAnchor: AnchorSide,
  end: Point,
  targetAnchor: AnchorSide
): Point[] {
  const d1 = getAnchorDirection(sourceAnchor);
  const d2 = getAnchorDirection(targetAnchor);
  const margin = 28;
  const p1 = { x: start.x + d1.x * margin, y: start.y + d1.y * margin };
  const p2 = { x: end.x + d2.x * margin, y: end.y + d2.y * margin };

  const h1 = d1.x !== 0;
  const h2 = d2.x !== 0;

  let pts: Point[];
  if (h1 && h2) {
    if (d1.x === -d2.x && (end.x - start.x) * d1.x >= margin) {
      const midX = (start.x + end.x) / 2;
      pts = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
    } else {
      const midY = (p1.y + p2.y) / 2;
      pts = [start, p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2, end];
    }
  } else if (!h1 && !h2) {
    if (d1.y === -d2.y && (end.y - start.y) * d1.y >= margin) {
      const midY = (start.y + end.y) / 2;
      pts = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
    } else {
      const midX = (p1.x + p2.x) / 2;
      pts = [start, p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2, end];
    }
  } else if (h1 && !h2) {
    const canSimpleL =
      (end.x - start.x) * d1.x >= margin && (start.y - end.y) * d2.y >= margin;
    if (canSimpleL) {
      pts = [start, { x: end.x, y: start.y }, end];
    } else {
      pts = [start, p1, { x: p1.x, y: p2.y }, p2, end];
    }
  } else {
    const canSimpleL =
      (end.y - start.y) * d1.y >= margin && (start.x - end.x) * d2.x >= margin;
    if (canSimpleL) {
      pts = [start, { x: start.x, y: end.y }, end];
    } else {
      pts = [start, p1, { x: p2.x, y: p1.y }, p2, end];
    }
  }

  return cleanOrthogonalPoints(pts);
}

export function computeEdgeGeometry(
  edge: Pick<InfraEdge, 'sourceAnchor' | 'targetAnchor' | 'routing' | 'curveType'>,
  sourceBox: Pick<RectBox, 'x' | 'y' | 'width' | 'height'>,
  targetBox: Pick<RectBox, 'x' | 'y' | 'width' | 'height'>
): EdgeGeometry {
  const start = getAnchorPoint(sourceBox, edge.sourceAnchor);
  const end = getAnchorPoint(targetBox, edge.targetAnchor);
  const routing = edge.routing ?? edge.curveType ?? 'curved';

  if (routing === 'straight') {
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const endAngle = Math.atan2(end.y - start.y, end.x - start.x);
    const startAngle = Math.atan2(start.y - end.y, start.x - end.x);
    return {
      start,
      end,
      c1: start,
      c2: end,
      points: [start, end],
      midpoint,
      endAngle,
      startAngle,
      svgPath: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    };
  }

  if (routing === 'orthogonal') {
    const points = buildOrthogonalPoints(start, edge.sourceAnchor, end, edge.targetAnchor);
    const midpoint = polylineMidpoint(points);
    const second = points[1] ?? end;
    const prevLast = points[points.length - 2] ?? start;
    const endAngle = Math.atan2(end.y - prevLast.y, end.x - prevLast.x);
    const startAngle = Math.atan2(start.y - second.y, start.x - second.x);
    const svgPath = points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
    return {
      start,
      end,
      c1: second,
      c2: prevLast,
      points,
      midpoint,
      endAngle,
      startAngle,
      svgPath,
    };
  }

  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const offset = Math.max(44, Math.min(140, dist * 0.42));
  const d1 = getAnchorDirection(edge.sourceAnchor);
  const d2 = getAnchorDirection(edge.targetAnchor);

  const c1: Point = { x: start.x + d1.x * offset, y: start.y + d1.y * offset };
  const c2: Point = { x: end.x + d2.x * offset, y: end.y + d2.y * offset };

  // Cubic Bezier midpoint at t = 0.5
  const midpoint: Point = {
    x: 0.125 * start.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * end.x,
    y: 0.125 * start.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * end.y,
  };

  const endAngle = Math.atan2(end.y - c2.y, end.x - c2.x);
  const startAngle = Math.atan2(start.y - c1.y, start.x - c1.x);

  return {
    start,
    end,
    c1,
    c2,
    points: [start, c1, c2, end],
    midpoint,
    endAngle,
    startAngle,
    svgPath: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
  };
}

export function getArrowheadPoints(tip: Point, angle: number, length = 12, spread = 0.46): [Point, Point] {
  const p1: Point = {
    x: tip.x - length * Math.cos(angle - spread),
    y: tip.y - length * Math.sin(angle - spread),
  };
  const p2: Point = {
    x: tip.x - length * Math.cos(angle + spread),
    y: tip.y - length * Math.sin(angle + spread),
  };
  return [p1, p2];
}

export function computeDiagramBounds(
  doc: DiagramDocument,
  selection?: Selection
): BoundingBox | null {
  const selectedIds = selection && selection.length > 0 ? new Set(selection.map((s) => `${s.kind}:${s.id}`)) : null;

  const groups = selectedIds ? doc.groups.filter((g) => selectedIds.has(`group:${g.id}`)) : doc.groups;
  const nodes = selectedIds ? doc.nodes.filter((n) => selectedIds.has(`node:${n.id}`)) : doc.nodes;
  const texts = selectedIds ? doc.texts.filter((t) => selectedIds.has(`text:${t.id}`)) : doc.texts;
  const edges = selectedIds
    ? doc.edges.filter(
        (e) =>
          selectedIds.has(`edge:${e.id}`) ||
          (selectedIds.has(`${e.sourceKind ?? 'node'}:${e.sourceId}`) &&
            selectedIds.has(`${e.targetKind ?? 'node'}:${e.targetId}`))
      )
    : doc.edges;

  if (nodes.length === 0 && groups.length === 0 && texts.length === 0 && edges.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const g of groups) {
    const headerTextLen = g.label.length + (g.meta ? g.meta.length + 3 : 0);
    const estHeaderW = 24 + headerTextLen * 8.2;
    minX = Math.min(minX, g.x);
    minY = Math.min(minY, g.y - 28);
    maxX = Math.max(maxX, g.x + Math.max(g.width, estHeaderW));
    maxY = Math.max(maxY, g.y + g.height);
  }

  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  for (const t of texts) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + t.width);
    maxY = Math.max(maxY, t.y + t.height);
  }

  for (const e of edges) {
    const src = resolveEdgeEndpoint(doc, e.sourceId, e.sourceKind);
    const tgt = resolveEdgeEndpoint(doc, e.targetId, e.targetKind);
    if (!src || !tgt) continue;
    const geom = computeEdgeGeometry(e, src, tgt);

    for (const pt of geom.points) {
      minX = Math.min(minX, pt.x - 14);
      maxX = Math.max(maxX, pt.x + 14);
      minY = Math.min(minY, pt.y - 14);
      maxY = Math.max(maxY, pt.y + 14);
    }

    const halfLabelW = e.label.trim() ? Math.max(32, e.label.trim().length * 4.5 + 12) : 24;
    minX = Math.min(minX, geom.midpoint.x - halfLabelW);
    maxX = Math.max(maxX, geom.midpoint.x + halfLabelW);
    minY = Math.min(minY, geom.midpoint.y - 24);
    maxY = Math.max(maxY, geom.midpoint.y + 24);
  }

  if (!Number.isFinite(minX)) return null;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * Finds the smallest-area group whose rectangle contains the center point of `box`.
 */
export function findSmallestContainingGroup(
  groups: InfraGroup[],
  box: Pick<RectBox, 'x' | 'y' | 'width' | 'height'>,
  excludeGroupIds?: Set<string>
): InfraGroup | null {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let best: InfraGroup | null = null;
  let bestArea = Infinity;

  for (const g of groups) {
    if (excludeGroupIds?.has(g.id)) continue;
    if (cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height) {
      const area = g.width * g.height;
      if (area < bestArea) {
        bestArea = area;
        best = g;
      }
    }
  }
  return best;
}

export function getGroupDescendantIds(
  doc: Pick<DiagramDocument, 'groups' | 'nodes' | 'texts'>,
  rootGroupIds: Iterable<string>
): { groupIds: Set<string>; nodeIds: Set<string>; textIds: Set<string> } {
  const groupIds = new Set<string>(rootGroupIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of doc.groups) {
      if (g.parentId && groupIds.has(g.parentId) && !groupIds.has(g.id)) {
        groupIds.add(g.id);
        changed = true;
      }
    }
  }

  const nodeIds = new Set<string>();
  for (const n of doc.nodes) {
    if (n.parentId && groupIds.has(n.parentId)) {
      nodeIds.add(n.id);
    }
  }

  const textIds = new Set<string>();
  for (const t of doc.texts) {
    if (t.parentId && groupIds.has(t.parentId)) {
      textIds.add(t.id);
    }
  }

  return { groupIds, nodeIds, textIds };
}

/**
 * Infers `parentId` hierarchy from geometry for legacy v1 documents that lacked `parentId`.
 */
export function inferContainment(doc: DiagramDocument): DiagramDocument {
  const groups = doc.groups.map((g) => {
    if (g.parentId) return g;
    const candidates = doc.groups.filter((other) => other.id !== g.id && other.width * other.height > g.width * g.height);
    const parent = findSmallestContainingGroup(candidates, g);
    return parent ? { ...g, parentId: parent.id } : g;
  });

  const nodes: InfraNode[] = doc.nodes.map((n) => {
    if (n.parentId) return n;
    const parent = findSmallestContainingGroup(groups, n);
    return parent ? { ...n, parentId: parent.id } : n;
  });

  const texts: InfraText[] = doc.texts.map((t) => {
    if (t.parentId) return t;
    const parent = findSmallestContainingGroup(groups, t);
    return parent ? { ...t, parentId: parent.id } : t;
  });

  return { ...doc, groups, nodes, texts };
}
