import rough from 'roughjs';
import { COLOR_THEMES, ICON_PATHS } from '../data/catalog';
import {
  AnchorSide,
  ArrowHeadMode,
  ColorTheme,
  DiagramDocument,
  EdgeRouting,
  EndpointKind,
  ExportOptions,
  GroupKind,
  InfraEdge,
  InfraGroup,
  InfraNode,
  InfraText,
  Provider,
  Selection,
} from '../types/diagram';
import { getEmbeddedSvgFontStyle } from './fonts';
import {
  computeDiagramBounds,
  computeEdgeGeometry,
  getArrowheadPoints,
  inferContainment,
  randomSeed,
  resolveEdgeEndpoint,
} from './geometry';
import {
  buildRoundedRectPath,
  generateEdgeSketchPaths,
  generateGroupSketchPaths,
  generateNodeSketchPaths,
  generateNoteSketchPaths,
} from './roughSvg';

const VALID_THEMES = new Set<ColorTheme>(['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'violet']);
const VALID_PROVIDERS = new Set<Provider>(['generic', 'aws', 'gcp', 'azure', 'k8s']);
const VALID_ANCHORS = new Set<AnchorSide>(['top', 'right', 'bottom', 'left']);
const VALID_GROUP_KINDS = new Set<GroupKind>(['vpc', 'subnet-public', 'subnet-private', 'cluster']);
const VALID_ROUTINGS = new Set<EdgeRouting>(['curved', 'straight', 'orthogonal']);
const VALID_ARROWS = new Set<ArrowHeadMode>(['end', 'both', 'none']);

function slugifyTitle(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'infrasketch-diagram';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeUniqueId(candidate: unknown, fallbackPrefix: string, idx: number, used: Set<string>): string {
  const base = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : `${fallbackPrefix}-${idx}`;
  let id = base;
  let suffix = 1;
  while (used.has(id)) {
    id = `${base}-${suffix++}`;
  }
  used.add(id);
  return id;
}

export function exportDiagramToJson(doc: DiagramDocument): void {
  const payload: DiagramDocument = {
    ...doc,
    version: 2,
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

export function parseAndValidateDiagramJson(
  rawText: string
): { ok: true; doc: DiagramDocument } | { ok: false; error: string } {
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

  const usedGroupIds = new Set<string>();
  const groupIdRemap = new Map<string, string>();

  const rawGroups = Array.isArray(obj.groups)
    ? obj.groups.filter((g): g is Record<string, unknown> => Boolean(g && typeof g === 'object'))
    : [];

  const groups: InfraGroup[] = rawGroups.map((g, idx) => {
    const rawId = typeof g.id === 'string' && g.id.trim() ? g.id.trim() : '';
    const id = makeUniqueId(g.id, 'grp-imp', idx, usedGroupIds);
    if (rawId && !groupIdRemap.has(rawId)) groupIdRemap.set(rawId, id);

    return {
      id,
      kind: VALID_GROUP_KINDS.has(g.kind as GroupKind) ? (g.kind as GroupKind) : 'vpc',
      label: typeof g.label === 'string' ? g.label : 'VPC Network',
      meta: typeof g.meta === 'string' ? g.meta : '',
      x: typeof g.x === 'number' && Number.isFinite(g.x) ? g.x : 100,
      y: typeof g.y === 'number' && Number.isFinite(g.y) ? g.y : 100,
      width: typeof g.width === 'number' && Number.isFinite(g.width) && g.width >= 160 ? g.width : 360,
      height: typeof g.height === 'number' && Number.isFinite(g.height) && g.height >= 120 ? g.height : 240,
      colorTheme: VALID_THEMES.has(g.colorTheme as ColorTheme) ? (g.colorTheme as ColorTheme) : 'indigo',
      seed: typeof g.seed === 'number' && Number.isFinite(g.seed) ? g.seed : randomSeed(),
      parentId: typeof g.parentId === 'string' ? g.parentId : undefined,
      locked: Boolean(g.locked),
    };
  });

  // Remap group parentIds and validate against group IDs
  const validGroupIds = new Set(groups.map((g) => g.id));
  for (const g of groups) {
    if (g.parentId) {
      const mapped = groupIdRemap.get(g.parentId) ?? g.parentId;
      g.parentId = mapped !== g.id && validGroupIds.has(mapped) ? mapped : undefined;
    }
  }

  const usedNodeIds = new Set<string>();
  const nodeIdRemap = new Map<string, string>();

  const nodes: InfraNode[] = obj.nodes
    .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
    .map((n, idx) => {
      const rawId = typeof n.id === 'string' && n.id.trim() ? n.id.trim() : '';
      const id = makeUniqueId(n.id, 'node-imp', idx, usedNodeIds);
      if (rawId && !nodeIdRemap.has(rawId)) nodeIdRemap.set(rawId, id);

      const rawParent = typeof n.parentId === 'string' ? groupIdRemap.get(n.parentId) ?? n.parentId : undefined;
      return {
        id,
        type: typeof n.type === 'string' ? n.type : 'server',
        provider: VALID_PROVIDERS.has(n.provider as Provider) ? (n.provider as Provider) : 'generic',
        label: typeof n.label === 'string' ? n.label : 'Component',
        sublabel: typeof n.sublabel === 'string' ? n.sublabel : '',
        iconKey: typeof n.iconKey === 'string' && ICON_PATHS[n.iconKey] ? n.iconKey : 'server',
        x: typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : 120 + idx * 40,
        y: typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : 120 + idx * 30,
        width: typeof n.width === 'number' && Number.isFinite(n.width) && n.width >= 110 ? n.width : 168,
        height: typeof n.height === 'number' && Number.isFinite(n.height) && n.height >= 60 ? n.height : 76,
        colorTheme: VALID_THEMES.has(n.colorTheme as ColorTheme) ? (n.colorTheme as ColorTheme) : 'slate',
        seed: typeof n.seed === 'number' && Number.isFinite(n.seed) ? n.seed : randomSeed(),
        parentId: rawParent && validGroupIds.has(rawParent) ? rawParent : undefined,
        locked: Boolean(n.locked),
      };
    });

  const usedTextIds = new Set<string>();
  const texts: InfraText[] = Array.isArray(obj.texts)
    ? obj.texts
        .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
        .map((t, idx) => {
          const rawParent = typeof t.parentId === 'string' ? groupIdRemap.get(t.parentId) ?? t.parentId : undefined;
          return {
            id: makeUniqueId(t.id, 'txt-imp', idx, usedTextIds),
            text: typeof t.text === 'string' ? t.text : 'Catatan',
            variant: t.variant === 'text' ? 'text' : 'note',
            x: typeof t.x === 'number' && Number.isFinite(t.x) ? t.x : 120,
            y: typeof t.y === 'number' && Number.isFinite(t.y) ? t.y : 120,
            width: typeof t.width === 'number' && Number.isFinite(t.width) && t.width >= 100 ? t.width : 180,
            height: typeof t.height === 'number' && Number.isFinite(t.height) && t.height >= 44 ? t.height : 72,
            colorTheme: VALID_THEMES.has(t.colorTheme as ColorTheme) ? (t.colorTheme as ColorTheme) : 'amber',
            seed: typeof t.seed === 'number' && Number.isFinite(t.seed) ? t.seed : randomSeed(),
            parentId: rawParent && validGroupIds.has(rawParent) ? rawParent : undefined,
            locked: Boolean(t.locked),
          };
        })
    : [];

  const validNodeIds = new Set(nodes.map((n) => n.id));
  const usedEdgeIds = new Set<string>();

  const edges: InfraEdge[] = obj.edges
    .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
    .map((e, idx) => {
      const sourceKind: EndpointKind = e.sourceKind === 'group' ? 'group' : 'node';
      const targetKind: EndpointKind = e.targetKind === 'group' ? 'group' : 'node';
      const rawSrc = typeof e.sourceId === 'string' ? e.sourceId : '';
      const rawTgt = typeof e.targetId === 'string' ? e.targetId : '';
      const sourceId = sourceKind === 'group' ? groupIdRemap.get(rawSrc) ?? rawSrc : nodeIdRemap.get(rawSrc) ?? rawSrc;
      const targetId = targetKind === 'group' ? groupIdRemap.get(rawTgt) ?? rawTgt : nodeIdRemap.get(rawTgt) ?? rawTgt;

      const srcExists = sourceKind === 'group' ? validGroupIds.has(sourceId) : validNodeIds.has(sourceId);
      const tgtExists = targetKind === 'group' ? validGroupIds.has(targetId) : validNodeIds.has(targetId);
      if (!srcExists || !tgtExists) return null;
      if (sourceKind === targetKind && sourceId === targetId) return null;

      const routing: EdgeRouting = VALID_ROUTINGS.has(e.routing as EdgeRouting)
        ? (e.routing as EdgeRouting)
        : e.curveType === 'straight'
          ? 'straight'
          : 'curved';

      const arrowHead: ArrowHeadMode = VALID_ARROWS.has(e.arrowHead as ArrowHeadMode)
        ? (e.arrowHead as ArrowHeadMode)
        : e.bidirectional
          ? 'both'
          : 'end';

      const edge: InfraEdge = {
        id: makeUniqueId(e.id, 'edge-imp', idx, usedEdgeIds),
        sourceId,
        sourceKind,
        sourceAnchor: VALID_ANCHORS.has(e.sourceAnchor as AnchorSide) ? (e.sourceAnchor as AnchorSide) : 'right',
        targetId,
        targetKind,
        targetAnchor: VALID_ANCHORS.has(e.targetAnchor as AnchorSide) ? (e.targetAnchor as AnchorSide) : 'left',
        label: typeof e.label === 'string' ? e.label : '',
        lineStyle: e.lineStyle === 'dashed' ? 'dashed' : 'solid',
        routing,
        arrowHead,
        colorTheme: VALID_THEMES.has(e.colorTheme as ColorTheme) ? (e.colorTheme as ColorTheme) : 'slate',
        seed: typeof e.seed === 'number' && Number.isFinite(e.seed) ? e.seed : randomSeed(),
      };
      return edge;
    })
    .filter((e): e is InfraEdge => e !== null);

  let doc: DiagramDocument = {
    version: 2,
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Imported Architecture',
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
    groups,
    nodes,
    texts,
    edges,
  };

  const incomingVersion = typeof obj.version === 'number' ? obj.version : 1;
  const hasAnyParent = groups.some((g) => g.parentId) || nodes.some((n) => n.parentId);
  if (incomingVersion < 2 && !hasAnyParent && groups.length > 0) {
    doc = inferContainment(doc);
  }

  return { ok: true, doc };
}

function getExportElements(doc: DiagramDocument, selection?: Selection, selectionOnly = false) {
  if (!selectionOnly || !selection || selection.length === 0) {
    return doc;
  }
  const selSet = new Set(selection.map((s) => `${s.kind}:${s.id}`));
  const groups = doc.groups.filter((g) => selSet.has(`group:${g.id}`));
  const nodes = doc.nodes.filter((n) => selSet.has(`node:${n.id}`));
  const texts = doc.texts.filter((t) => selSet.has(`text:${t.id}`));
  const edges = doc.edges.filter(
    (e) =>
      selSet.has(`edge:${e.id}`) ||
      (selSet.has(`${e.sourceKind ?? 'node'}:${e.sourceId}`) &&
        selSet.has(`${e.targetKind ?? 'node'}:${e.targetId}`))
  );
  return { ...doc, groups, nodes, texts, edges };
}

function drawTruncatedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): void {
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
 * Renders the sketch diagram onto an HTML5 Canvas 2D context for crisp Retina-ready PNG export
 * and clipboard copy.
 */
export async function renderDiagramToCanvas(
  doc: DiagramDocument,
  options: Pick<ExportOptions, 'background' | 'scale' | 'padding' | 'selectionOnly'>,
  selection?: Selection
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number } | null> {
  const filteredDoc = getExportElements(doc, selection, options.selectionOnly);
  const bounds = computeDiagramBounds(filteredDoc);
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
  for (const group of filteredDoc.groups) {
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
  for (const edge of filteredDoc.edges) {
    const src = resolveEdgeEndpoint(doc, edge.sourceId, edge.sourceKind);
    const tgt = resolveEdgeEndpoint(doc, edge.targetId, edge.targetKind);
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

    if (edge.arrowHead === 'end' || edge.arrowHead === 'both') {
      const [ep1, ep2] = getArrowheadPoints(geom.end, geom.endAngle, 12, 0.45);
      rc.path(`M ${ep1.x} ${ep1.y} L ${geom.end.x} ${geom.end.y} L ${ep2.x} ${ep2.y}`, {
        seed: edge.seed + 17,
        roughness: 0.8,
        bowing: 0.6,
        stroke: theme.stroke,
        strokeWidth: 1.85,
      });
    }

    if (edge.arrowHead === 'both') {
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
      ctx.fillStyle = options.background === 'white' ? '#ffffff' : 'rgba(255, 255, 255, 0.94)';
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(geom.midpoint.x - boxW / 2, geom.midpoint.y - boxH / 2, boxW, boxH, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(edge.label, geom.midpoint.x, geom.midpoint.y + 1);
      ctx.restore();
    }
  }

  // Layer 3: Cloud Service Nodes
  for (const node of filteredDoc.nodes) {
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

    const iconBoxSize = 36;
    const iconBoxX = node.x + 12;
    const iconBoxY = node.y + (node.height - iconBoxSize) / 2;

    ctx.save();
    ctx.fillStyle = theme.iconBg;
    ctx.beginPath();
    ctx.roundRect(iconBoxX, iconBoxY, iconBoxSize, iconBoxSize, 8);
    ctx.fill();

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

    const textX = iconBoxX + iconBoxSize + 10;
    const maxTextW = node.width - (iconBoxSize + 30);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 13px "Architects Daughter", cursive, sans-serif';
    ctx.fillStyle = '#0f172a';
    const labelY = node.sublabel ? node.y + node.height / 2 - 8 : node.y + node.height / 2;
    drawTruncatedText(ctx, node.label, textX, labelY, maxTextW);

    if (node.sublabel) {
      ctx.font = '400 10.5px "JetBrains Mono", monospace';
      ctx.fillStyle = '#64748b';
      drawTruncatedText(ctx, node.sublabel, textX, node.y + node.height / 2 + 12, maxTextW);
    }
  }

  // Layer 4: Sticky Notes & Free Text Annotations
  for (const item of filteredDoc.texts) {
    const theme = COLOR_THEMES[item.colorTheme] ?? COLOR_THEMES.amber;
    if (item.variant === 'note') {
      const rectPath = buildRoundedRectPath(item.x, item.y, item.width, item.height, 8);
      rc.path(rectPath, {
        seed: item.seed,
        roughness: 0.95,
        bowing: 0.8,
        stroke: theme.stroke,
        strokeWidth: 1.45,
        fill: theme.fill,
        fillStyle: 'solid',
      });
    }

    ctx.save();
    ctx.font = '400 13px "Architects Daughter", cursive, sans-serif';
    ctx.fillStyle = item.variant === 'note' ? '#0f172a' : theme.stroke;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = item.text.split('\n');
    const padX = item.variant === 'note' ? 12 : 4;
    const padY = item.variant === 'note' ? 10 : 4;
    lines.forEach((line, idx) => {
      const ly = item.y + padY + idx * 18;
      if (ly + 16 <= item.y + item.height) {
        drawTruncatedText(ctx, line, item.x + padX, ly, item.width - padX * 2);
      }
    });
    ctx.restore();
  }

  ctx.restore();

  return { canvas, width: logicalWidth, height: logicalHeight };
}

export async function downloadDiagramAsPng(
  doc: DiagramDocument,
  options: ExportOptions,
  selection?: Selection
): Promise<boolean> {
  const rendered = await renderDiagramToCanvas(doc, options, selection);
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

export async function copyDiagramPngToClipboard(
  doc: DiagramDocument,
  options: ExportOptions,
  selection?: Selection
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
    return { ok: false, error: 'Browser tidak mendukung salin gambar ke clipboard.' };
  }
  const rendered = await renderDiagramToCanvas(doc, options, selection);
  if (!rendered) {
    return { ok: false, error: 'Tidak ada elemen untuk disalin.' };
  }

  const blob = await new Promise<Blob | null>((resolve) => rendered.canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    return { ok: false, error: 'Gagal membuat gambar PNG.' };
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Izin clipboard ditolak browser. Gunakan Unduh PNG.' };
  }
}

export function buildDiagramSvgString(
  doc: DiagramDocument,
  options: Pick<ExportOptions, 'background' | 'padding' | 'selectionOnly'>,
  selection?: Selection,
  embeddedFontCss = ''
): { svg: string; width: number; height: number } | null {
  const filteredDoc = getExportElements(doc, selection, options.selectionOnly);
  const bounds = computeDiagramBounds(filteredDoc);
  if (!bounds) return null;

  const padding = options.padding;
  const width = Math.ceil(bounds.width + padding * 2);
  const height = Math.ceil(bounds.height + padding * 2);
  const offsetX = -bounds.minX + padding;
  const offsetY = -bounds.minY + padding;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );

  if (embeddedFontCss) {
    parts.push(`<defs><style><![CDATA[${embeddedFontCss}]]></style></defs>`);
  }

  if (options.background === 'white') {
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);
  }

  parts.push(`<g transform="translate(${offsetX}, ${offsetY})">`);

  // Layer 1: Groups
  for (const group of filteredDoc.groups) {
    const theme = COLOR_THEMES[group.colorTheme] ?? COLOR_THEMES.indigo;
    const isDashed = group.kind !== 'cluster';
    const paths = generateGroupSketchPaths(
      group.width,
      group.height,
      theme.groupFill,
      theme.groupStroke,
      group.seed,
      isDashed
    );
    parts.push(`<g transform="translate(${group.x}, ${group.y})">`);
    for (const p of paths) {
      const dashAttr = p.strokeLineDash ? ` stroke-dasharray="${p.strokeLineDash.join(' ')}"` : '';
      parts.push(
        `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`
      );
    }
    const metaPart = group.meta
      ? `<tspan dx="8" fill="#64748b" font-size="11" font-weight="400" font-family="'JetBrains Mono', monospace">· ${escapeXml(group.meta)}</tspan>`
      : '';
    parts.push(
      `<text x="12" y="-8" fill="${theme.stroke}" font-size="14" font-weight="600" font-family="'Architects Daughter', cursive, sans-serif">${escapeXml(group.label)}${metaPart}</text>`
    );
    parts.push('</g>');
  }

  // Layer 2: Edges
  for (const edge of filteredDoc.edges) {
    const src = resolveEdgeEndpoint(doc, edge.sourceId, edge.sourceKind);
    const tgt = resolveEdgeEndpoint(doc, edge.targetId, edge.targetKind);
    if (!src || !tgt) continue;
    const geom = computeEdgeGeometry(edge, src, tgt);
    const theme = COLOR_THEMES[edge.colorTheme] ?? COLOR_THEMES.slate;
    const paths = generateEdgeSketchPaths(
      geom,
      theme.stroke,
      edge.seed,
      edge.lineStyle === 'dashed',
      edge.arrowHead
    );
    parts.push('<g>');
    for (const p of paths) {
      const dashAttr = p.strokeLineDash ? ` stroke-dasharray="${p.strokeLineDash.join(' ')}"` : '';
      parts.push(
        `<path d="${p.d}" fill="none" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`
      );
    }
    if (edge.label.trim()) {
      const labelText = edge.label.trim();
      const labelWidth = Math.max(46, labelText.length * 7.6 + 16);
      parts.push(
        `<g transform="translate(${geom.midpoint.x}, ${geom.midpoint.y})">` +
          `<rect x="${-labelWidth / 2}" y="-11" width="${labelWidth}" height="22" rx="5" fill="#ffffff" fill-opacity="0.94" stroke="#e2e8f0" stroke-width="0.8"/>` +
          `<text x="0" y="1" text-anchor="middle" dominant-baseline="middle" fill="#1e293b" font-size="12.5" font-family="'Architects Daughter', cursive, sans-serif">${escapeXml(labelText)}</text>` +
          `</g>`
      );
    }
    parts.push('</g>');
  }

  // Layer 3: Nodes
  for (const node of filteredDoc.nodes) {
    const theme = COLOR_THEMES[node.colorTheme] ?? COLOR_THEMES.slate;
    const paths = generateNodeSketchPaths(node.width, node.height, theme.fill, theme.stroke, node.seed);
    const iconPaths = ICON_PATHS[node.iconKey] ?? ICON_PATHS.server;
    const iconBoxSize = 36;
    const iconBoxX = 12;
    const iconBoxY = (node.height - iconBoxSize) / 2;
    const textX = iconBoxX + iconBoxSize + 10;
    const clipId = `svg-clip-${escapeXml(node.id)}`;

    parts.push(`<g transform="translate(${node.x}, ${node.y})">`);
    for (const p of paths) {
      parts.push(
        `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }
    parts.push(`<rect x="${iconBoxX}" y="${iconBoxY}" width="${iconBoxSize}" height="${iconBoxSize}" rx="8" fill="${theme.iconBg}"/>`);
    parts.push(
      `<g transform="translate(${iconBoxX + 7}, ${iconBoxY + 7}) scale(${22 / 24})" fill="none" stroke="${theme.iconColor}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">`
    );
    for (const d of iconPaths) {
      parts.push(`<path d="${d}"/>`);
    }
    parts.push('</g>');
    parts.push(`<clipPath id="${clipId}"><rect x="${textX}" y="6" width="${Math.max(20, node.width - textX - 10)}" height="${node.height - 12}"/></clipPath>`);
    parts.push(`<g clip-path="url(#${clipId})">`);
    parts.push(
      `<text x="${textX}" y="${node.sublabel ? node.height / 2 - 7 : node.height / 2 + 1}" dominant-baseline="middle" fill="#0f172a" font-size="13" font-weight="600" font-family="'Architects Daughter', cursive, sans-serif">${escapeXml(node.label)}</text>`
    );
    if (node.sublabel) {
      parts.push(
        `<text x="${textX}" y="${node.height / 2 + 13}" dominant-baseline="middle" fill="#64748b" font-size="10.5" font-family="'JetBrains Mono', monospace">${escapeXml(node.sublabel)}</text>`
      );
    }
    parts.push('</g></g>');
  }

  // Layer 4: Texts / Sticky Notes
  for (const item of filteredDoc.texts) {
    const theme = COLOR_THEMES[item.colorTheme] ?? COLOR_THEMES.amber;
    parts.push(`<g transform="translate(${item.x}, ${item.y})">`);
    if (item.variant === 'note') {
      const notePaths = generateNoteSketchPaths(item.width, item.height, theme.fill, theme.stroke, item.seed);
      for (const p of notePaths) {
        parts.push(
          `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
        );
      }
    }
    const padX = item.variant === 'note' ? 12 : 4;
    const padY = item.variant === 'note' ? 10 : 4;
    const textColor = item.variant === 'note' ? '#0f172a' : theme.stroke;
    const lines = item.text.split('\n');
    lines.forEach((line, idx) => {
      parts.push(
        `<text x="${padX}" y="${padY + 12 + idx * 18}" fill="${textColor}" font-size="13" font-family="'Architects Daughter', cursive, sans-serif">${escapeXml(line)}</text>`
      );
    });
    parts.push('</g>');
  }

  parts.push('</g></svg>');
  return { svg: parts.join(''), width, height };
}

export async function downloadDiagramAsSvg(
  doc: DiagramDocument,
  options: ExportOptions,
  selection?: Selection
): Promise<boolean> {
  const fontCss = await getEmbeddedSvgFontStyle();
  const built = buildDiagramSvgString(doc, options, selection, fontCss);
  if (!built) return false;

  const blob = new Blob([built.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugifyTitle(doc.title)}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
