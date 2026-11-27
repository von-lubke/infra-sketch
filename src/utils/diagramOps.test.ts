import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_TEMPLATES } from '../data/templates';
import {
  applyCopiedStyle,
  buildClipboardEnvelope,
  cloneElements,
  extractCopiedStyle,
  nudgeSelection,
  parseClipboardEnvelope,
  pasteClipboardEnvelope,
  reorderSelection,
} from './diagramOps';

describe('diagramOps', () => {
  it('clones multi-selected nodes along with connecting edges (Ctrl+Drag / Ctrl+D)', () => {
    const doc = ARCHITECTURE_TEMPLATES[0].build();
    const sel = [
      { kind: 'node' as const, id: 'node-lb' },
      { kind: 'node' as const, id: 'node-app-1' },
    ];
    const { nextDoc, clonedSelection } = cloneElements(doc, sel, { x: 40, y: 50 });

    expect(nextDoc.nodes.length).toBe(doc.nodes.length + 2);
    expect(clonedSelection).toHaveLength(2);
    // Edge between node-lb and node-app-1 (edge-4) should also be cloned
    expect(nextDoc.edges.length).toBe(doc.edges.length + 1);

    const clonedEdge = nextDoc.edges[nextDoc.edges.length - 1];
    expect(clonedEdge.sourceId).not.toBe('node-lb');
    expect(clonedEdge.targetId).not.toBe('node-app-1');
    expect(clonedSelection.some((s) => s.id === clonedEdge.sourceId)).toBe(true);
    expect(clonedSelection.some((s) => s.id === clonedEdge.targetId)).toBe(true);
  });

  it('clones group along with nested child groups, nodes, and internal edges', () => {
    const doc = ARCHITECTURE_TEMPLATES[0].build();
    const { nextDoc, clonedSelection } = cloneElements(
      doc,
      [{ kind: 'group', id: 'grp-vpc-main' }],
      { x: 100, y: 100 }
    );

    // 3 groups in three-tier (vpc + public + private) -> cloned 3 more
    expect(nextDoc.groups.length).toBe(doc.groups.length + 3);
    // 5 nodes inside VPC (lb, s3, app-1, app-2, db)
    expect(nextDoc.nodes.length).toBe(doc.nodes.length + 5);
    expect(clonedSelection).toHaveLength(1);
    expect(clonedSelection[0].kind).toBe('group');
  });

  it('serializes and pastes clipboard envelope with fresh IDs', () => {
    const doc = ARCHITECTURE_TEMPLATES[0].build();
    const env = buildClipboardEnvelope(doc, [{ kind: 'node', id: 'node-client' }]);
    expect(env).not.toBeNull();
    const parsed = parseClipboardEnvelope(JSON.stringify(env));
    expect(parsed).not.toBeNull();
    const { nextDoc, pastedSelection } = pasteClipboardEnvelope(doc, parsed!, { x: 20, y: 20 });
    expect(nextDoc.nodes.length).toBe(doc.nodes.length + 1);
    expect(pastedSelection[0].id).not.toBe('node-client');
  });

  it('nudges unlocked elements and skips locked ones', () => {
    const doc = ARCHITECTURE_TEMPLATES[0].build();
    doc.nodes[0].locked = true;
    const origX = doc.nodes[0].x;
    const nudged = nudgeSelection(doc, [{ kind: 'node', id: doc.nodes[0].id }], 20, 0);
    expect(nudged.nodes[0].x).toBe(origX);

    const moved = nudgeSelection(doc, [{ kind: 'node', id: doc.nodes[1].id }], 20, -10);
    expect(moved.nodes[1].x).toBe(doc.nodes[1].x + 20);
    expect(moved.nodes[1].y).toBe(doc.nodes[1].y - 10);
  });

  it('keeps child groups above parent groups when reordering', () => {
    const doc = ARCHITECTURE_TEMPLATES[0].build();
    const reordered = reorderSelection(doc, [{ kind: 'group', id: 'grp-vpc-main' }], 'front');
    const vpcIdx = reordered.groups.findIndex((g) => g.id === 'grp-vpc-main');
    const pubIdx = reordered.groups.findIndex((g) => g.id === 'grp-pub-sub');
    expect(vpcIdx).toBeLessThan(pubIdx);
  });

  it('copies and applies style properties across nodes', () => {
    const doc = ARCHITECTURE_TEMPLATES[0].build();
    const style = extractCopiedStyle(doc, { kind: 'node', id: 'node-cache' });
    expect(style?.colorTheme).toBe('rose');
    const updated = applyCopiedStyle(doc, [{ kind: 'node', id: 'node-client' }], style!);
    expect(updated.nodes.find((n) => n.id === 'node-client')?.colorTheme).toBe('rose');
  });
});
