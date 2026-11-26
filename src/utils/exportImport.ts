import rough from 'roughjs';
import { COLOR_THEMES, ICON_PATHS } from '../data/catalog';
import {
  AnchorSide,
  ColorTheme,
  DiagramDocument,
  GroupKind,
  InfraEdge,
  InfraGroup,
  InfraNode,
  PngExportOptions,
  Provider,
} from '../types/diagram';
import { computeDiagramBounds, computeEdgeGeometry, getArrowheadPoints, randomSeed } from './geometry';
import { buildRoundedRectPath } from './roughSvg';

const VALID_THEMES = new Set<ColorTheme>(['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'violet']);
const VALID_PROVIDERS = new Set<Provider>(['generic', 'aws', 'gcp', 'k8s']);
const VALID_ANCHORS = new Set<AnchorSide>(['top', 'right', 'bottom', 'left']);
const VALID_GROUP_KINDS = new Set<GroupKind>(['vpc', 'subnet-public', 'subnet-private', 'cluster']);

function slugifyTitle(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'infrasketch-diagram';
}

export function exportDiagramToJson(doc: DiagramDocument): void {
  const payload: DiagramDocument = {
    ...doc,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugifyTitle(doc.title)}.infrasketch.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseAndValidateDiagramJson(rawText: string): { ok: true; doc: DiagramDocument } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'File bukan format JSON yang valid.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Struktur dokumen JSON tidak dikenali.' };
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
    return { ok: false, error: 'File JSON harus memiliki properti "nodes" dan "edges".' };
  }

  const groups: InfraGroup[] = Array.isArray(obj.groups)
    ? obj.groups
        .filter((g): g is Record<string, unknown> => Boolean(g && typeof g === 'object'))
        .map((g, idx) => ({
          id: typeof g.id === 'string' && g.id ? g.id : `grp-imp-${idx}`,
          kind: VALID_GROUP_KINDS.has(g.kind as GroupKind) ? (g.kind as GroupKind) : 'vpc',
          label: typeof g.label === 'string' ? g.label : 'VPC Network',
          meta: typeof g.meta === 'string' ? g.meta : '',
          x: typeof g.x === 'number' && Number.isFinite(g.x) ? g.x : 100,
          y: typeof g.y === 'number' && Number.isFinite(g.y) ? g.y : 100,
          width: typeof g.width === 'number' && g.width >= 160 ? g.width : 360,
          height: typeof g.height === 'number' && g.height >= 120 ? g.height : 240,
          colorTheme: VALID_THEMES.has(g.colorTheme as ColorTheme) ? (g.colorTheme as ColorTheme) : 'indigo',
          seed: typeof g.seed === 'number' && Number.isFinite(g.seed) ? g.seed : randomSeed(),
        }))
    : [];

  const nodes: InfraNode[] = obj.nodes
    .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
    .map((n, idx) => ({
      id: typeof n.id === 'string' && n.id ? n.id : `node-imp-${idx}`,
      type: typeof n.type === 'string' ? n.type : 'server',
      provider: VALID_PROVIDERS.has(n.provider as Provider) ? (n.provider as Provider) : 'generic',
      label: typeof n.label === 'string' ? n.label : 'Component',
      sublabel: typeof n.sublabel === 'string' ? n.sublabel : '',
      iconKey: typeof n.iconKey === 'string' && ICON_PATHS[n.iconKey] ? n.iconKey : 'server',
      x: typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : 120 + idx * 40,
      y: typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : 120 + idx * 30,
      width: typeof n.width === 'number' && n.width >= 110 ? n.width : 168,
      height: typeof n.height === 'number' && n.height >= 60 ? n.height : 76,
      colorTheme: VALID_THEMES.has(n.colorTheme as ColorTheme) ? (n.colorTheme as ColorTheme) : 'slate',
      seed: typeof n.seed === 'number' && Number.isFinite(n.seed) ? n.seed : randomSeed(),
    }));

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edges: InfraEdge[] = obj.edges
    .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
    .filter((e) => typeof e.sourceId === 'string' && typeof e.targetId === 'string' && nodeIdSet.has(e.sourceId) && nodeIdSet.has(e.targetId))
    .map((e, idx) => ({
      id: typeof e.id === 'string' && e.id ? e.id : `edge-imp-${idx}`,
      sourceId: e.sourceId as string,
      sourceAnchor: VALID_ANCHORS.has(e.sourceAnchor as AnchorSide) ? (e.sourceAnchor as AnchorSide) : 'right',
      targetId: e.targetId as string,
      targetAnchor: VALID_ANCHORS.has(e.targetAnchor as AnchorSide) ? (e.targetAnchor as AnchorSide) : 'left',
      label: typeof e.label === 'string' ? e.label : '',
      lineStyle: e.lineStyle === 'dashed' ? 'dashed' : 'solid',
      curveType: e.curveType === 'straight' ? 'straight' : 'curved',
      bidirectional: Boolean(e.bidirectional),
      colorTheme: VALID_THEMES.has(e.colorTheme as ColorTheme) ? (e.colorTheme as ColorTheme) : 'slate',
      seed: typeof e.seed === 'number' && Number.isFinite(e.seed) ? e.seed : randomSeed(),
    }));

  return {
    ok: true,
    doc: {
      version: 1,
      title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Imported Architecture',
      updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
      groups,
      nodes,
      edges,
    },
  };
}

function drawTruncatedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): void {
  if (!text) return;
  let display = text;
  if (ctx.measureText(display).width > maxWidth) {
    while (display.length > 1 && ctx.measureText(`${display}…`).width > maxWidth) {
      display = display.slice(0, -1);
    }
    display = `${display}…`;
  }
  ctx.fillText(display, x, y);
}

/**
 * Renders the exact same Excalidraw-style roughjs diagram directly onto an
 * HTML5 Canvas 2D context so PNG exports are crisp, Retina-ready, and immune
 * to SVG foreignObject/CORS limitations.
 */
export async function renderDiagramToCanvas(
  doc: DiagramDocument,
  options: PngExportOptions
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number } | null> {
  const bounds = computeDiagramBounds(doc);
  if (!bounds) return null;

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const padding = options.padding;
  const logicalWidth = Math.ceil(bounds.width + padding * 2);
  const logicalHeight = Math.ceil(bounds.height + padding * 2);

  const canvas = document.createElement('canvas');
  canvas.width = logicalWidth * options.scale;
  canvas.height = logicalHeight * options.scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(options.scale, options.scale);

  if (options.background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  } else {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
  }

  ctx.save();
  ctx.translate(-bounds.minX + padding, -bounds.minY + padding);

  const rc = rough.canvas(canvas);

  // Layer 1: VPC / Subnet / Cluster Groups
  for (const group of doc.groups) {
    const theme = COLOR_THEMES[group.colorTheme] ?? COLOR_THEMES.indigo;
    const isDashed = group.kind !== 'cluster';
    const rectPath = buildRoundedRectPath(group.x, group.y, group.width, group.height, 14);

    rc.path(rectPath, {
      seed: group.seed,
      roughness: 1.15,
      bowing: 0.85,
      stroke: theme.groupStroke,
      strokeWidth: 1.65,
      fill: theme.groupFill,
      fillStyle: 'solid',
      strokeLineDash: isDashed ? [8, 6] : undefined,
    });

    // Top-left label above border
    ctx.font = '600 14px "Architects Daughter", cursive, sans-serif';
    ctx.fillStyle = theme.stroke;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(group.label, group.x + 12, group.y - 6);

    if (group.meta) {
      const labelWidth = ctx.measureText(group.label).width;
      ctx.font = '400 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#64748b';
      ctx.fillText(`· ${group.meta}`, group.x + 18 + labelWidth, group.y - 7);
    }
  }

  // Layer 2: Labeled Connector Edges
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const edge of doc.edges) {
    const src = nodeMap.get(edge.sourceId);
    const tgt = nodeMap.get(edge.targetId);
    if (!src || !tgt) continue;

    const geom = computeEdgeGeometry(edge, src, tgt);
    const theme = COLOR_THEMES[edge.colorTheme] ?? COLOR_THEMES.slate;
    const dash = edge.lineStyle === 'dashed' ? [7, 5] : undefined;

    rc.path(geom.svgPath, {
      seed: edge.seed,
      roughness: 0.95,
      bowing: 0.9,
      stroke: theme.stroke,
      strokeWidth: 1.85,
      strokeLineDash: dash,
    });

    const [ep1, ep2] = getArrowheadPoints(geom.end, geom.endAngle, 12, 0.45);
    rc.path(`M ${ep1.x} ${ep1.y} L ${geom.end.x} ${geom.end.y} L ${ep2.x} ${ep2.y}`, {
      seed: edge.seed + 17,
      roughness: 0.8,
      bowing: 0.6,
      stroke: theme.stroke,
      strokeWidth: 1.85,
    });

    if (edge.bidirectional) {
      const [sp1, sp2] = getArrowheadPoints(geom.start, geom.startAngle, 12, 0.45);
      rc.path(`M ${sp1.x} ${sp1.y} L ${geom.start.x} ${geom.start.y} L ${sp2.x} ${sp2.y}`, {
        seed: edge.seed + 31,
        roughness: 0.8,
        bowing: 0.6,
        stroke: theme.stroke,
        strokeWidth: 1.85,
      });
    }

    if (edge.label.trim()) {
      ctx.font = '400 12.5px "Architects Daughter", cursive, sans-serif';
      const metrics = ctx.measureText(edge.label);
      const boxW = metrics.width + 14;
      const boxH = 22;

      ctx.save();
      ctx.fillStyle = options.background === 'white' ? '#ffffff' : 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.roundRect(geom.midpoint.x - boxW / 2, geom.midpoint.y - boxH / 2, boxW, boxH, 5);
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(edge.label, geom.midpoint.x, geom.midpoint.y + 1);
      ctx.restore();
    }
  }

  // Layer 3: Cloud Service Nodes
  for (const node of doc.nodes) {
    const theme = COLOR_THEMES[node.colorTheme] ?? COLOR_THEMES.slate;
    const rectPath = buildRoundedRectPath(node.x, node.y, node.width, node.height, 12);

    rc.path(rectPath, {
      seed: node.seed,
      roughness: 1.05,
      bowing: 0.9,
      stroke: theme.stroke,
      strokeWidth: 1.75,
      fill: theme.fill,
      fillStyle: 'solid',
    });

    // Icon badge square inside left side of node
    const iconBoxSize = 36;
    const iconBoxX = node.x + 12;
    const iconBoxY = node.y + (node.height - iconBoxSize) / 2;

    ctx.save();
    ctx.fillStyle = theme.iconBg;
    ctx.beginPath();
    ctx.roundRect(iconBoxX, iconBoxY, iconBoxSize, iconBoxSize, 8);
    ctx.fill();

    // Draw vector icon using Path2D
    const paths = ICON_PATHS[node.iconKey] ?? ICON_PATHS.server;
    ctx.translate(iconBoxX + 7, iconBoxY + 7);
    ctx.scale(22 / 24, 22 / 24);
    ctx.strokeStyle = theme.iconColor;
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const d of paths) {
      ctx.stroke(new Path2D(d));
    }
    ctx.restore();

    // Node text (label + monospace sublabel)
    const textX = iconBoxX + iconBoxSize + 10;
    const maxTextW = node.width - (iconBoxSize + 30);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 14px "Architects Daughter", cursive, sans-serif';
    ctx.fillStyle = '#0f172a';
    const labelY = node.sublabel ? node.y + node.height / 2 - 8 : node.y + node.height / 2;
    drawTruncatedText(ctx, node.label, textX, labelY, maxTextW);

    if (node.sublabel) {
      ctx.font = '400 10.5px "JetBrains Mono", monospace';
      ctx.fillStyle = '#64748b';
      drawTruncatedText(ctx, node.sublabel, textX, node.y + node.height / 2 + 12, maxTextW);
    }
  }

  ctx.restore();

  return { canvas, width: logicalWidth, height: logicalHeight };
}

export async function downloadDiagramAsPng(doc: DiagramDocument, options: PngExportOptions): Promise<boolean> {
  const rendered = await renderDiagramToCanvas(doc, options);
  if (!rendered) return false;

  return new Promise((resolve) => {
    rendered.canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slugifyTitle(doc.title)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      resolve(true);
    }, 'image/png');
  });
}
