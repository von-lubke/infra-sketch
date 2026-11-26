import { AnchorSide, DiagramDocument, InfraEdge, InfraNode } from '../types/diagram';
import { GRID_SIZE } from '../data/catalog';

export interface Point {
  x: number;
  y: number;
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

export function getAnchorPoint(node: InfraNode, side: AnchorSide): Point {
  switch (side) {
    case 'top':
      return { x: node.x + node.width / 2, y: node.y };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 };
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

export function pickClosestAnchor(node: InfraNode, target: Point): AnchorSide {
  const sides: AnchorSide[] = ['top', 'right', 'bottom', 'left'];
  let best: AnchorSide = 'left';
  let bestDist = Infinity;

  for (const side of sides) {
    const pt = getAnchorPoint(node, side);
    const d = Math.hypot(pt.x - target.x, pt.y - target.y);
    if (d < bestDist) {
      bestDist = d;
      best = side;
    }
  }
  return best;
}

export function pickBestAnchorPair(
  source: InfraNode,
  target: InfraNode
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
  midpoint: Point;
  endAngle: number;
  startAngle: number;
  svgPath: string;
}

export function computeEdgeGeometry(
  edge: Pick<InfraEdge, 'sourceAnchor' | 'targetAnchor' | 'curveType'>,
  sourceNode: InfraNode,
  targetNode: InfraNode
): EdgeGeometry {
  const start = getAnchorPoint(sourceNode, edge.sourceAnchor);
  const end = getAnchorPoint(targetNode, edge.targetAnchor);

  if (edge.curveType === 'straight') {
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const endAngle = Math.atan2(end.y - start.y, end.x - start.x);
    const startAngle = Math.atan2(start.y - end.y, start.x - end.x);
    return {
      start,
      end,
      c1: start,
      c2: end,
      midpoint,
      endAngle,
      startAngle,
      svgPath: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
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

  // Tangent at t = 1 is (end - c2); tangent at t = 0 pointing back is (start - c1)
  const endAngle = Math.atan2(end.y - c2.y, end.x - c2.x);
  const startAngle = Math.atan2(start.y - c1.y, start.x - c1.x);

  return {
    start,
    end,
    c1,
    c2,
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

export function computeDiagramBounds(doc: DiagramDocument): BoundingBox | null {
  if (doc.nodes.length === 0 && doc.groups.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const g of doc.groups) {
    minX = Math.min(minX, g.x);
    minY = Math.min(minY, g.y - 26); // account for top group title
    maxX = Math.max(maxX, g.x + g.width);
    maxY = Math.max(maxY, g.y + g.height);
  }

  for (const n of doc.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  // Also account for curved edge control points & labels
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const e of doc.edges) {
    const src = nodeMap.get(e.sourceId);
    const tgt = nodeMap.get(e.targetId);
    if (!src || !tgt) continue;
    const geom = computeEdgeGeometry(e, src, tgt);
    minX = Math.min(minX, geom.midpoint.x - 60);
    maxX = Math.max(maxX, geom.midpoint.x + 60);
    minY = Math.min(minY, geom.midpoint.y - 24);
    maxY = Math.max(maxY, geom.midpoint.y + 24);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
