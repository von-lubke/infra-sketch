import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_TEMPLATES } from '../data/templates';
import { buildDiagramSvgString, parseAndValidateDiagramJson } from './exportImport';

describe('exportImport', () => {
  it('migrates v1 JSON documents to v2, infers containment, deduplicates IDs, and removes self-loops', () => {
    const legacyV1 = JSON.stringify({
      version: 1,
      title: 'Legacy <Diagram> & Co',
      groups: [
        { id: 'dup', kind: 'vpc', label: 'VPC', meta: '10.0.0.0/16', x: 0, y: 0, width: 400, height: 300 },
      ],
      nodes: [
        { id: 'dup-node', type: 'server', provider: 'aws', label: 'App 1', x: 50, y: 50, width: 168, height: 76 },
        { id: 'dup-node', type: 'database', provider: 'aws', label: 'App 2', x: 500, y: 50, width: 168, height: 76 },
      ],
      edges: [
        {
          id: 'e1',
          sourceId: 'dup-node',
          targetId: 'dup-node',
          curveType: 'straight',
          bidirectional: true,
          label: 'self-loop',
        },
        {
          id: 'e2',
          sourceId: 'dup-node',
          targetId: 'missing',
          label: 'dangling',
        },
      ],
    });

    const parsed = parseAndValidateDiagramJson(legacyV1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.doc.version).toBe(2);
    expect(parsed.doc.nodes).toHaveLength(2);
    expect(new Set(parsed.doc.nodes.map((n) => n.id)).size).toBe(2);
    expect(parsed.doc.nodes[0].parentId).toBe('dup');
    expect(parsed.doc.nodes[1].parentId).toBeUndefined();
    expect(parsed.doc.edges).toHaveLength(0);
  });

  it('rejects malformed JSON cleanly', () => {
    const bad = parseAndValidateDiagramJson('{invalid');
    expect(bad.ok).toBe(false);
  });

  it('builds valid standalone SVG with XML-escaped labels', () => {
    const doc = ARCHITECTURE_TEMPLATES[0].build();
    doc.nodes[0].label = 'Auth & <Gateway>';
    const res = buildDiagramSvgString(doc, { background: 'white', padding: 24, selectionOnly: false });
    expect(res).not.toBeNull();
    expect(res!.svg.startsWith('<svg ')).toBe(true);
    expect(res!.svg).toContain('Auth &amp; &lt;Gateway&gt;');
    expect(res!.svg.endsWith('</svg>')).toBe(true);
  });
});
