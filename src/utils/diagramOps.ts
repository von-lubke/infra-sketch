import {
  CopiedStyle,
  DiagramDocument,
  InfraEdge,
  InfraGroup,
  InfraNode,
  InfraText,
  Selection,
  SelectionItem,
  SelectionKind,
} from '../types/diagram';
import {
  findSmallestContainingGroup,
  generateId,
  getGroupDescendantIds,
  randomSeed,
} from './geometry';

export interface ClipboardEnvelope {
  app: 'infrasketch-clipboard';
  version: 2;
  groups: InfraGroup[];
  nodes: InfraNode[];
  texts: InfraText[];
  edges: InfraEdge[];
}

export function selectionHas(selection: Selection, kind: SelectionKind, id: string): boolean {
  return selection.some((s) => s.kind === kind && s.id === id);
}

export function toggleSelectionItem(selection: Selection, item: SelectionItem): Selection {
  if (selectionHas(selection, item.kind, item.id)) {
    return selection.filter((s) => !(s.kind === item.kind && s.id === item.id));
  }
  return [...selection, item];
}

export function deleteSelection(doc: DiagramDocument, selection: Selection): DiagramDocument {
  if (selection.length === 0) return doc;
  const delNodes = new Set(selection.filter((s) => s.kind === 'node').map((s) => s.id));
  const delGroups = new Set(selection.filter((s) => s.kind === 'group').map((s) => s.id));
  const delTexts = new Set(selection.filter((s) => s.kind === 'text').map((s) => s.id));
  const delEdges = new Set(selection.filter((s) => s.kind === 'edge').map((s) => s.id));

  const remainingGroups = doc.groups
    .filter((g) => !delGroups.has(g.id))
    .map((g) => (g.parentId && delGroups.has(g.parentId) ? { ...g, parentId: undefined } : g));

  const remainingNodes = doc.nodes
    .filter((n) => !delNodes.has(n.id))
    .map((n) => (n.parentId && delGroups.has(n.parentId) ? { ...n, parentId: undefined } : n));

  const remainingTexts = doc.texts
    .filter((t) => !delTexts.has(t.id))
    .map((t) => (t.parentId && delGroups.has(t.parentId) ? { ...t, parentId: undefined } : t));

  const remainingEdges = doc.edges.filter((e) => {
    if (delEdges.has(e.id)) return false;
    const srcDeleted =
      (e.sourceKind ?? 'node') === 'group' ? delGroups.has(e.sourceId) : delNodes.has(e.sourceId);
    const tgtDeleted =
      (e.targetKind ?? 'node') === 'group' ? delGroups.has(e.targetId) : delNodes.has(e.targetId);
    return !srcDeleted && !tgtDeleted;
  });

  return {
    ...doc,
    groups: remainingGroups,
    nodes: remainingNodes,
    texts: remainingTexts,
    edges: remainingEdges,
  };
}

/**
 * Clones selected nodes, groups (including their nested descendants), texts, and any edges
 * connecting endpoints within the cloned set. Used identically by Ctrl+Drag, Ctrl+D, and Paste.
 */
export function cloneElements(
  doc: DiagramDocument,
  selection: Selection,
  offset: { x: number; y: number }
): { nextDoc: DiagramDocument; clonedSelection: Selection } {
  const selectedGroupIds = selection.filter((s) => s.kind === 'group').map((s) => s.id);
  const descendants = getGroupDescendantIds(doc, selectedGroupIds);

  const sourceGroupIds = new Set<string>([...selectedGroupIds, ...descendants.groupIds]);
  const sourceNodeIds = new Set<string>([
    ...selection.filter((s) => s.kind === 'node').map((s) => s.id),
    ...descendants.nodeIds,
  ]);
  const sourceTextIds = new Set<string>([
    ...selection.filter((s) => s.kind === 'text').map((s) => s.id),
    ...descendants.textIds,
  ]);

  if (sourceGroupIds.size === 0 && sourceNodeIds.size === 0 && sourceTextIds.size === 0) {
    return { nextDoc: doc, clonedSelection: [] };
  }

  const groupIdMap = new Map<string, string>();
  const nodeIdMap = new Map<string, string>();

  for (const gid of sourceGroupIds) groupIdMap.set(gid, generateId('grp'));
  for (const nid of sourceNodeIds) nodeIdMap.set(nid, generateId('node'));

  const clonedGroups: InfraGroup[] = doc.groups
    .filter((g) => sourceGroupIds.has(g.id))
    .map((g) => ({
      ...g,
      id: groupIdMap.get(g.id)!,
      x: g.x + offset.x,
      y: g.y + offset.y,
      seed: randomSeed(),
      locked: false,
      parentId: g.parentId && groupIdMap.has(g.parentId) ? groupIdMap.get(g.parentId) : g.parentId,
    }));

  const clonedNodes: InfraNode[] = doc.nodes
    .filter((n) => sourceNodeIds.has(n.id))
    .map((n) => ({
      ...n,
      id: nodeIdMap.get(n.id)!,
      x: n.x + offset.x,
      y: n.y + offset.y,
      seed: randomSeed(),
      locked: false,
      parentId: n.parentId && groupIdMap.has(n.parentId) ? groupIdMap.get(n.parentId) : n.parentId,
    }));

  const clonedTexts: InfraText[] = doc.texts
    .filter((t) => sourceTextIds.has(t.id))
    .map((t) => ({
      ...t,
      id: generateId('txt'),
      x: t.x + offset.x,
      y: t.y + offset.y,
      seed: randomSeed(),
      locked: false,
      parentId: t.parentId && groupIdMap.has(t.parentId) ? groupIdMap.get(t.parentId) : t.parentId,
    }));

  const clonedEdges: InfraEdge[] = doc.edges
    .filter((e) => {
      const srcIncluded =
        (e.sourceKind ?? 'node') === 'group' ? groupIdMap.has(e.sourceId) : nodeIdMap.has(e.sourceId);
      const tgtIncluded =
        (e.targetKind ?? 'node') === 'group' ? groupIdMap.has(e.targetId) : nodeIdMap.has(e.targetId);
      return srcIncluded && tgtIncluded;
    })
    .map((e) => ({
      ...e,
      id: generateId('edge'),
      sourceId:
        (e.sourceKind ?? 'node') === 'group'
          ? groupIdMap.get(e.sourceId)!
          : nodeIdMap.get(e.sourceId)!,
      targetId:
        (e.targetKind ?? 'node') === 'group'
          ? groupIdMap.get(e.targetId)!
          : nodeIdMap.get(e.targetId)!,
      seed: randomSeed(),
    }));

  const clonedSelection: Selection = [
    ...clonedGroups
      .filter((g) => !g.parentId || !clonedGroups.some((pg) => pg.id === g.parentId))
      .map((g) => ({ kind: 'group' as const, id: g.id })),
    ...clonedNodes
      .filter((n) => !n.parentId || !clonedGroups.some((pg) => pg.id === n.parentId))
      .map((n) => ({ kind: 'node' as const, id: n.id })),
    ...clonedTexts
      .filter((t) => !t.parentId || !clonedGroups.some((pg) => pg.id === t.parentId))
      .map((t) => ({ kind: 'text' as const, id: t.id })),
  ];

  // Fallback if everything had an internal parent cycle (shouldn't happen)
  const finalSelection =
    clonedSelection.length > 0
      ? clonedSelection
      : [
          ...clonedGroups.map((g) => ({ kind: 'group' as const, id: g.id })),
          ...clonedNodes.map((n) => ({ kind: 'node' as const, id: n.id })),
          ...clonedTexts.map((t) => ({ kind: 'text' as const, id: t.id })),
        ];

  return {
    nextDoc: {
      ...doc,
      groups: [...doc.groups, ...clonedGroups],
      nodes: [...doc.nodes, ...clonedNodes],
      texts: [...doc.texts, ...clonedTexts],
      edges: [...doc.edges, ...clonedEdges],
    },
    clonedSelection: finalSelection,
  };
}

export function buildClipboardEnvelope(doc: DiagramDocument, selection: Selection): ClipboardEnvelope | null {
  const selectedGroupIds = selection.filter((s) => s.kind === 'group').map((s) => s.id);
  const descendants = getGroupDescendantIds(doc, selectedGroupIds);

  const groupIds = new Set([...selectedGroupIds, ...descendants.groupIds]);
  const nodeIds = new Set([
    ...selection.filter((s) => s.kind === 'node').map((s) => s.id),
    ...descendants.nodeIds,
  ]);
  const textIds = new Set([
    ...selection.filter((s) => s.kind === 'text').map((s) => s.id),
    ...descendants.textIds,
  ]);

  const groups = doc.groups.filter((g) => groupIds.has(g.id));
  const nodes = doc.nodes.filter((n) => nodeIds.has(n.id));
  const texts = doc.texts.filter((t) => textIds.has(t.id));

  if (groups.length === 0 && nodes.length === 0 && texts.length === 0) return null;

  const edges = doc.edges.filter((e) => {
    const srcOk = (e.sourceKind ?? 'node') === 'group' ? groupIds.has(e.sourceId) : nodeIds.has(e.sourceId);
    const tgtOk = (e.targetKind ?? 'node') === 'group' ? groupIds.has(e.targetId) : nodeIds.has(e.targetId);
    return srcOk && tgtOk;
  });

  return {
    app: 'infrasketch-clipboard',
    version: 2,
    groups,
    nodes,
    texts,
    edges,
  };
}

export function parseClipboardEnvelope(raw: string): ClipboardEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ClipboardEnvelope>;
    if (
      !parsed ||
      parsed.app !== 'infrasketch-clipboard' ||
      !Array.isArray(parsed.groups) ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      return null;
    }
    return {
      app: 'infrasketch-clipboard',
      version: 2,
      groups: parsed.groups,
      nodes: parsed.nodes,
      texts: Array.isArray(parsed.texts) ? parsed.texts : [],
      edges: parsed.edges,
    };
  } catch {
    return null;
  }
}

export function pasteClipboardEnvelope(
  doc: DiagramDocument,
  envelope: ClipboardEnvelope,
  offset = { x: 32, y: 32 }
): { nextDoc: DiagramDocument; pastedSelection: Selection } {
  const groupIdMap = new Map<string, string>();
  const nodeIdMap = new Map<string, string>();
  for (const g of envelope.groups) groupIdMap.set(g.id, generateId('grp'));
  for (const n of envelope.nodes) nodeIdMap.set(n.id, generateId('node'));

  const newGroups: InfraGroup[] = envelope.groups.map((g) => ({
    ...g,
    id: groupIdMap.get(g.id)!,
    x: g.x + offset.x,
    y: g.y + offset.y,
    seed: randomSeed(),
    locked: false,
    parentId: g.parentId && groupIdMap.has(g.parentId) ? groupIdMap.get(g.parentId) : undefined,
  }));

  const newNodes: InfraNode[] = envelope.nodes.map((n) => ({
    ...n,
    id: nodeIdMap.get(n.id)!,
    x: n.x + offset.x,
    y: n.y + offset.y,
    seed: randomSeed(),
    locked: false,
    parentId: n.parentId && groupIdMap.has(n.parentId) ? groupIdMap.get(n.parentId) : undefined,
  }));

  const newTexts: InfraText[] = envelope.texts.map((t) => ({
    ...t,
    id: generateId('txt'),
    x: t.x + offset.x,
    y: t.y + offset.y,
    seed: randomSeed(),
    locked: false,
    parentId: t.parentId && groupIdMap.has(t.parentId) ? groupIdMap.get(t.parentId) : undefined,
  }));

  const newEdges: InfraEdge[] = envelope.edges
    .filter((e) => {
      const srcOk = (e.sourceKind ?? 'node') === 'group' ? groupIdMap.has(e.sourceId) : nodeIdMap.has(e.sourceId);
      const tgtOk = (e.targetKind ?? 'node') === 'group' ? groupIdMap.has(e.targetId) : nodeIdMap.has(e.targetId);
      return srcOk && tgtOk;
    })
    .map((e) => ({
      ...e,
      id: generateId('edge'),
      sourceId:
        (e.sourceKind ?? 'node') === 'group'
          ? groupIdMap.get(e.sourceId)!
          : nodeIdMap.get(e.sourceId)!,
      targetId:
        (e.targetKind ?? 'node') === 'group'
          ? groupIdMap.get(e.targetId)!
          : nodeIdMap.get(e.targetId)!,
      seed: randomSeed(),
    }));

  const pastedSelection: Selection = [
    ...newGroups.map((g) => ({ kind: 'group' as const, id: g.id })),
    ...newNodes.map((n) => ({ kind: 'node' as const, id: n.id })),
    ...newTexts.map((t) => ({ kind: 'text' as const, id: t.id })),
  ];

  const mergedDoc: DiagramDocument = {
    ...doc,
    groups: [...doc.groups, ...newGroups],
    nodes: [...doc.nodes, ...newNodes],
    texts: [...doc.texts, ...newTexts],
    edges: [...doc.edges, ...newEdges],
  };

  return {
    nextDoc: reconcileContainment(mergedDoc, pastedSelection),
    pastedSelection,
  };
}

export function nudgeSelection(
  doc: DiagramDocument,
  selection: Selection,
  dx: number,
  dy: number
): DiagramDocument {
  if (selection.length === 0 || (dx === 0 && dy === 0)) return doc;

  const selectedGroups = selection.filter((s) => s.kind === 'group').map((s) => s.id);
  const descendants = getGroupDescendantIds(doc, selectedGroups);

  const moveGroups = new Set([...selectedGroups, ...descendants.groupIds]);
  const moveNodes = new Set([
    ...selection.filter((s) => s.kind === 'node').map((s) => s.id),
    ...descendants.nodeIds,
  ]);
  const moveTexts = new Set([
    ...selection.filter((s) => s.kind === 'text').map((s) => s.id),
    ...descendants.textIds,
  ]);

  let changed = false;
  const groups = doc.groups.map((g) => {
    if (!moveGroups.has(g.id) || g.locked) return g;
    changed = true;
    return { ...g, x: g.x + dx, y: g.y + dy };
  });
  const nodes = doc.nodes.map((n) => {
    if (!moveNodes.has(n.id) || n.locked) return n;
    changed = true;
    return { ...n, x: n.x + dx, y: n.y + dy };
  });
  const texts = doc.texts.map((t) => {
    if (!moveTexts.has(t.id) || t.locked) return t;
    changed = true;
    return { ...t, x: t.x + dx, y: t.y + dy };
  });

  if (!changed) return doc;
  return reconcileContainment({ ...doc, groups, nodes, texts }, selection);
}

/**
 * Updates `parentId` for moved nodes, texts, and standalone groups based on smallest enclosing container.
 */
export function reconcileContainment(doc: DiagramDocument, moved: Selection): DiagramDocument {
  const movedGroupIds = new Set(moved.filter((s) => s.kind === 'group').map((s) => s.id));
  const movedNodeIds = new Set(moved.filter((s) => s.kind === 'node').map((s) => s.id));
  const movedTextIds = new Set(moved.filter((s) => s.kind === 'text').map((s) => s.id));

  const descendants = getGroupDescendantIds(doc, movedGroupIds);

  const groups = doc.groups.map((g) => {
    if (!movedGroupIds.has(g.id)) return g;
    // Top-level moved group can nest inside a larger stationary group
    const candidates = doc.groups.filter(
      (other) =>
        other.id !== g.id &&
        !descendants.groupIds.has(other.id) &&
        other.width * other.height > g.width * g.height
    );
    const parent = findSmallestContainingGroup(candidates, g);
    const nextParentId = parent?.id;
    return g.parentId === nextParentId ? g : { ...g, parentId: nextParentId };
  });

  const nodes = doc.nodes.map((n) => {
    if (!movedNodeIds.has(n.id) || descendants.nodeIds.has(n.id)) return n;
    const parent = findSmallestContainingGroup(groups, n);
    const nextParentId = parent?.id;
    return n.parentId === nextParentId ? n : { ...n, parentId: nextParentId };
  });

  const texts = doc.texts.map((t) => {
    if (!movedTextIds.has(t.id) || descendants.textIds.has(t.id)) return t;
    const parent = findSmallestContainingGroup(groups, t);
    const nextParentId = parent?.id;
    return t.parentId === nextParentId ? t : { ...t, parentId: nextParentId };
  });

  return { ...doc, groups, nodes, texts };
}

function reorderArray<T extends { id: string }>(
  items: T[],
  selectedIds: Set<string>,
  direction: 'forward' | 'backward' | 'front' | 'back'
): T[] {
  if (selectedIds.size === 0 || items.length < 2) return items;
  const result = [...items];

  if (direction === 'front') {
    const rest = result.filter((item) => !selectedIds.has(item.id));
    const picked = result.filter((item) => selectedIds.has(item.id));
    return [...rest, ...picked];
  }
  if (direction === 'back') {
    const picked = result.filter((item) => selectedIds.has(item.id));
    const rest = result.filter((item) => !selectedIds.has(item.id));
    return [...picked, ...rest];
  }
  if (direction === 'forward') {
    for (let i = result.length - 2; i >= 0; i--) {
      if (selectedIds.has(result[i].id) && !selectedIds.has(result[i + 1].id)) {
        [result[i], result[i + 1]] = [result[i + 1], result[i]];
      }
    }
    return result;
  }
  for (let i = 1; i < result.length; i++) {
    if (selectedIds.has(result[i].id) && !selectedIds.has(result[i - 1].id)) {
      [result[i], result[i - 1]] = [result[i - 1], result[i]];
    }
  }
  return result;
}

/**
 * Ensures child groups always appear after their parent groups in render/hit order.
 */
function sortGroupsRespectingNesting(groups: InfraGroup[]): InfraGroup[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const depthOf = (g: InfraGroup): number => {
    let depth = 0;
    let cur: InfraGroup | undefined = g;
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
      if (cur) depth++;
    }
    return depth;
  };
  return [...groups].sort((a, b) => depthOf(a) - depthOf(b));
}

export function reorderSelection(
  doc: DiagramDocument,
  selection: Selection,
  direction: 'forward' | 'backward' | 'front' | 'back'
): DiagramDocument {
  const nodeIds = new Set(selection.filter((s) => s.kind === 'node').map((s) => s.id));
  const groupIds = new Set(selection.filter((s) => s.kind === 'group').map((s) => s.id));
  const textIds = new Set(selection.filter((s) => s.kind === 'text').map((s) => s.id));
  const edgeIds = new Set(selection.filter((s) => s.kind === 'edge').map((s) => s.id));

  return {
    ...doc,
    groups: sortGroupsRespectingNesting(reorderArray(doc.groups, groupIds, direction)),
    nodes: reorderArray(doc.nodes, nodeIds, direction),
    texts: reorderArray(doc.texts, textIds, direction),
    edges: reorderArray(doc.edges, edgeIds, direction),
  };
}

export function extractCopiedStyle(doc: DiagramDocument, item: SelectionItem): CopiedStyle | null {
  if (item.kind === 'node') {
    const node = doc.nodes.find((n) => n.id === item.id);
    return node ? { colorTheme: node.colorTheme, width: node.width, height: node.height } : null;
  }
  if (item.kind === 'group') {
    const grp = doc.groups.find((g) => g.id === item.id);
    return grp ? { colorTheme: grp.colorTheme, width: grp.width, height: grp.height } : null;
  }
  if (item.kind === 'edge') {
    const edge = doc.edges.find((e) => e.id === item.id);
    return edge
      ? {
          colorTheme: edge.colorTheme,
          lineStyle: edge.lineStyle,
          routing: edge.routing,
          arrowHead: edge.arrowHead,
        }
      : null;
  }
  if (item.kind === 'text') {
    const txt = doc.texts.find((t) => t.id === item.id);
    return txt
      ? {
          colorTheme: txt.colorTheme,
          width: txt.width,
          height: txt.height,
          variant: txt.variant,
        }
      : null;
  }
  return null;
}

export function applyCopiedStyle(
  doc: DiagramDocument,
  selection: Selection,
  style: CopiedStyle
): DiagramDocument {
  if (selection.length === 0) return doc;
  const nodeIds = new Set(selection.filter((s) => s.kind === 'node').map((s) => s.id));
  const groupIds = new Set(selection.filter((s) => s.kind === 'group').map((s) => s.id));
  const edgeIds = new Set(selection.filter((s) => s.kind === 'edge').map((s) => s.id));
  const textIds = new Set(selection.filter((s) => s.kind === 'text').map((s) => s.id));

  return {
    ...doc,
    nodes: doc.nodes.map((n) =>
      nodeIds.has(n.id) && !n.locked
        ? {
            ...n,
            colorTheme: style.colorTheme,
            width: style.width && style.width >= 110 && style.width <= 360 ? style.width : n.width,
            height: style.height && style.height >= 60 && style.height <= 180 ? style.height : n.height,
          }
        : n
    ),
    groups: doc.groups.map((g) =>
      groupIds.has(g.id) && !g.locked ? { ...g, colorTheme: style.colorTheme } : g
    ),
    edges: doc.edges.map((e) =>
      edgeIds.has(e.id)
        ? {
            ...e,
            colorTheme: style.colorTheme,
            lineStyle: style.lineStyle ?? e.lineStyle,
            routing: style.routing ?? e.routing,
            arrowHead: style.arrowHead ?? e.arrowHead,
          }
        : e
    ),
    texts: doc.texts.map((t) =>
      textIds.has(t.id) && !t.locked
        ? {
            ...t,
            colorTheme: style.colorTheme,
            variant: style.variant ?? t.variant,
          }
        : t
    ),
  };
}
