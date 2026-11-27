import { describe, expect, it } from 'vitest';
import { DiagramDocument } from '../types/diagram';
import {
  computeDiagramBounds,
  computeEdgeGeometry,
  findSmallestContainingGroup,
  inferContainment,
  pickClosestAnchor,
} from './geometry';

function makeBaseDoc(): DiagramDocument {
  return {
    version: 2,
    title: 'Test',
    updatedAt: '2026-01-01T00:00:00.000Z',
    groups: [
      {
        id: 'vpc',
        kind: 'vpc',
        label: 'Production VPC With Very Long Header Text',
        meta: '10.0.0.0/16',
        x: 100,
        y: 100,
        width: 240,
        height: 220,
        colorTheme: 'indigo',
        seed: 1,
      },
      {
        id: 'subnet',
        kind: 'subnet-public',
        label: 'Sub',
        meta: '',
        x: 120,
        y: 130,
        width: 180,
        height: 150,
        colorTheme: 'sky',
        seed: 2,
      },
    ],
    nodes: [
      {
        id: 'n1',
        type: 'server',
        provider: 'generic',
        label: 'API',
        sublabel: '',
        iconKey: 'server',
        x: 130,
        y: 150,
        width: 140,
        height: 70,
        colorTheme: 'sky',
        seed: 3,
      },
      {
        id: 'n2',
        type: 'database',
        provider: 'generic',
        label: 'DB',
        sublabel: '',
        iconKey: 'database',
        x: 420,
        y: 150,
        width: 140,
        height: 70,
        colorTheme: 'emerald',
        seed: 4,
      },
    ],
    texts: [],
    edges: [
      {
        id: 'e1',
        sourceId: 'n1',
        sourceKind: 'node',
        sourceAnchor: 'right',
        targetId: 'n2',
        targetKind: 'node',
        targetAnchor: 'right',
        label: 'Loop',
        lineStyle: 'solid',
        routing: 'curved',
        arrowHead: 'end',
        colorTheme: 'slate',
        seed: 5,
      },
    ],
  };
}

describe('geometry', () => {
  it('computes orthogonal edge geometry with perpendicular endpoints and valid midpoint', () => {
    const doc = makeBaseDoc();
    // Aligned horizontally: simplifies cleanly to 2 endpoints
    const aligned = computeEdgeGeometry(
      { sourceAnchor: 'right', targetAnchor: 'left', routing: 'orthogonal' },
      doc.nodes[0],
      doc.nodes[1]
    );
    expect(aligned.points).toHaveLength(2);
    expect(aligned.endAngle).toBeCloseTo(0, 3);

    // Offset vertically: routes a 4-point orthogonal step
    const stepped = computeEdgeGeometry(
      { sourceAnchor: 'right', targetAnchor: 'left', routing: 'orthogonal' },
      doc.nodes[0],
      { ...doc.nodes[1], y: 260 }
    );
    expect(stepped.points).toHaveLength(4);
    expect(stepped.svgPath.startsWith('M ')).toBe(true);
    expect(stepped.midpoint.x).toBeGreaterThan(doc.nodes[0].x + doc.nodes[0].width);
    expect(stepped.midpoint.x).toBeLessThan(doc.nodes[1].x);
    expect(stepped.endAngle).toBeCloseTo(0, 3);
  });

  it('includes curved Bezier control points and wide group headers in bounds', () => {
    const doc = makeBaseDoc();
    const bounds = computeDiagramBounds(doc);
    expect(bounds).not.toBeNull();
    // Edge exits right -> right on n2 (x=560), so control point extends past 560
    expect(bounds!.maxX).toBeGreaterThan(580);
    // Selection-only bounds isolates just n1
    const selBounds = computeDiagramBounds(doc, [{ kind: 'node', id: 'n1' }]);
    expect(selBounds).not.toBeNull();
    expect(selBounds!.minX).toBe(130);
    expect(selBounds!.maxX).toBe(270);
  });

  it('assigns smallest containing group and infers hierarchy', () => {
    const doc = makeBaseDoc();
    const smallest = findSmallestContainingGroup(doc.groups, doc.nodes[0]);
    expect(smallest?.id).toBe('subnet');

    const inferred = inferContainment(doc);
    expect(inferred.groups.find((g) => g.id === 'subnet')?.parentId).toBe('vpc');
    expect(inferred.nodes.find((n) => n.id === 'n1')?.parentId).toBe('subnet');
    expect(inferred.nodes.find((n) => n.id === 'n2')?.parentId).toBeUndefined();
  });

  it('picks closest anchor side around a box', () => {
    const doc = makeBaseDoc();
    expect(pickClosestAnchor(doc.nodes[0], { x: 200, y: 100 })).toBe('top');
    expect(pickClosestAnchor(doc.nodes[0], { x: 500, y: 185 })).toBe('right');
  });
});
