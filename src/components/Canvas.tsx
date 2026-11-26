import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  BoxSelect,
  Grid3X3,
  Hand,
  Maximize2,
  Minus,
  MousePointer2,
  MoveUpRight,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { COLOR_THEMES, ICON_PATHS } from '../data/catalog';
import {
  AnchorSide,
  DiagramDocument,
  InfraEdge,
  InfraGroup,
  InfraNode,
  Selection,
  ToolMode,
  Viewport,
} from '../types/diagram';
import {
  computeEdgeGeometry,
  getAnchorPoint,
  pickBestAnchorPair,
  pickClosestAnchor,
  Point,
  snapValue,
} from '../utils/geometry';
import {
  generateEdgeSketchPaths,
  generateGroupSketchPaths,
  generateNodeSketchPaths,
} from '../utils/roughSvg';

interface CanvasProps {
  doc: DiagramDocument;
  viewport: Viewport;
  onViewportChange: React.Dispatch<React.SetStateAction<Viewport>>;
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  selection: Selection;
  onSelectionChange: (sel: Selection) => void;
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onQuickAddVpc: () => void;
  onDropCatalogItem: (rawPayload: string, worldX: number, worldY: number) => void;
  onTransientUpdateNode: (id: string, patch: Partial<InfraNode>) => void;
  onTransientUpdateGroup: (id: string, patch: Partial<InfraGroup>) => void;
  onCommitDocument: (beforeSnapshot: DiagramDocument) => void;
  onUpdateNodeLabel: (id: string, label: string) => void;
  onUpdateGroupLabel: (id: string, label: string) => void;
  onUpdateEdgeLabel: (id: string, label: string) => void;
  onCreateEdge: (sourceId: string, sourceAnchor: AnchorSide, targetId: string, targetAnchor: AnchorSide) => void;
  onDeleteSelected: () => void;
  onClearCanvas: () => void;
  onFitToView: () => void;
  onLoadStarterTemplate: (templateId: string) => void;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
}

const ANCHOR_SIDES: AnchorSide[] = ['top', 'right', 'bottom', 'left'];

type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

interface DragState {
  kind: 'pan' | 'node' | 'group' | 'resize-group' | 'connect';
  startClientX: number;
  startClientY: number;
  startWorldX: number;
  startWorldY: number;
  originPanX?: number;
  originPanY?: number;
  targetId?: string;
  originX?: number;
  originY?: number;
  originW?: number;
  originH?: number;
  resizeCorner?: ResizeCorner;
  sourceNodeId?: string;
  sourceAnchor?: AnchorSide;
  beforeSnapshot?: DiagramDocument;
  hasMoved?: boolean;
}

interface InlineEditState {
  kind: 'node' | 'group' | 'edge';
  id: string;
  value: string;
  worldX: number;
  worldY: number;
  width: number;
}

const SketchGroupItem = React.memo(function SketchGroupItem({
  group,
  isSelected,
  onPointerDown,
  onDoubleClick,
  onResizeStart,
}: {
  group: InfraGroup;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent, group: InfraGroup) => void;
  onDoubleClick: (e: React.MouseEvent, group: InfraGroup) => void;
  onResizeStart: (e: React.PointerEvent, group: InfraGroup, corner: ResizeCorner) => void;
}) {
  const theme = COLOR_THEMES[group.colorTheme] ?? COLOR_THEMES.indigo;
  const isDashed = group.kind !== 'cluster';

  const paths = useMemo(
    () => generateGroupSketchPaths(group.width, group.height, theme.groupFill, theme.groupStroke, group.seed, isDashed),
    [group.width, group.height, theme.groupFill, theme.groupStroke, group.seed, isDashed]
  );

  const corners: Array<{ corner: ResizeCorner; cx: number; cy: number; cursor: string }> = [
    { corner: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
    { corner: 'ne', cx: group.width, cy: 0, cursor: 'nesw-resize' },
    { corner: 'se', cx: group.width, cy: group.height, cursor: 'nwse-resize' },
    { corner: 'sw', cx: 0, cy: group.height, cursor: 'nesw-resize' },
  ];

  return (
    <g transform={`translate(${group.x}, ${group.y})`}>
      {/* Main container surface */}
      <g
        onPointerDown={(e) => onPointerDown(e, group)}
        onDoubleClick={(e) => onDoubleClick(e, group)}
        className="cursor-move"
      >
        {/* Solid hit area inside group */}
        <rect x={0} y={0} width={group.width} height={group.height} rx={14} fill="transparent" />

        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.fill === 'none' ? 'none' : p.fill}
            stroke={p.stroke === 'none' ? 'none' : p.stroke}
            strokeWidth={p.strokeWidth}
            strokeDasharray={p.strokeLineDash?.join(' ')}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Top-left label above border */}
        <text
          x={12}
          y={-8}
          fill={theme.stroke}
          fontSize={14}
          fontWeight={600}
          style={{ fontFamily: 'var(--font-sketch)' }}
          className="select-none pointer-events-auto"
        >
          {group.label}
          {group.meta ? (
            <tspan
              dx={8}
              fill="#64748b"
              fontSize={11}
              fontWeight={400}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              · {group.meta}
            </tspan>
          ) : null}
        </text>
      </g>

      {/* Selection frame & corner resize handles */}
      {isSelected && (
        <g>
          <rect
            x={-4}
            y={-4}
            width={group.width + 8}
            height={group.height + 8}
            rx={16}
            fill="none"
            stroke="#4f46e5"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            className="pointer-events-none"
          />
          {corners.map((c) => (
            <rect
              key={c.corner}
              x={c.cx - 5}
              y={c.cy - 5}
              width={10}
              height={10}
              rx={2.5}
              fill="#ffffff"
              stroke="#4f46e5"
              strokeWidth={2}
              style={{ cursor: c.cursor }}
              onPointerDown={(e) => onResizeStart(e, group, c.corner)}
            />
          ))}
        </g>
      )}
    </g>
  );
});

const SketchEdgeItem = React.memo(function SketchEdgeItem({
  edge,
  sourceNode,
  targetNode,
  isSelected,
  onSelect,
  onDoubleClick,
}: {
  edge: InfraEdge;
  sourceNode: InfraNode;
  targetNode: InfraNode;
  isSelected: boolean;
  onSelect: (e: React.PointerEvent, edge: InfraEdge) => void;
  onDoubleClick: (e: React.MouseEvent, edge: InfraEdge, midpoint: Point) => void;
}) {
  const theme = COLOR_THEMES[edge.colorTheme] ?? COLOR_THEMES.slate;
  const strokeColor = isSelected ? '#4f46e5' : theme.stroke;

  const geom = useMemo(
    () => computeEdgeGeometry(edge, sourceNode, targetNode),
    [
      edge.sourceAnchor,
      edge.targetAnchor,
      edge.curveType,
      sourceNode.x,
      sourceNode.y,
      sourceNode.width,
      sourceNode.height,
      targetNode.x,
      targetNode.y,
      targetNode.width,
      targetNode.height,
    ]
  );

  const paths = useMemo(
    () =>
      generateEdgeSketchPaths(
        geom,
        strokeColor,
        edge.seed,
        edge.lineStyle === 'dashed',
        edge.bidirectional
      ),
    [geom, strokeColor, edge.seed, edge.lineStyle, edge.bidirectional]
  );

  const labelWidth = edge.label.trim() ? Math.max(46, edge.label.trim().length * 7.6 + 16) : 0;

  return (
    <g
      onPointerDown={(e) => onSelect(e, edge)}
      onDoubleClick={(e) => onDoubleClick(e, edge, geom.midpoint)}
      className="cursor-pointer group"
    >
      {/* Wide invisible hit target */}
      <path d={geom.svgPath} fill="none" stroke="transparent" strokeWidth={18} />

      {/* Highlight halo when selected */}
      {isSelected && (
        <path
          d={geom.svgPath}
          fill="none"
          stroke="rgba(79, 70, 229, 0.22)"
          strokeWidth={7}
          strokeLinecap="round"
        />
      )}

      {/* Hand-drawn sketch arrow */}
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={p.stroke}
          strokeWidth={isSelected ? p.strokeWidth + 0.4 : p.strokeWidth}
          strokeDasharray={p.strokeLineDash?.join(' ')}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Midpoint Label */}
      {edge.label.trim() && (
        <g transform={`translate(${geom.midpoint.x}, ${geom.midpoint.y})`}>
          <rect
            x={-labelWidth / 2}
            y={-11}
            width={labelWidth}
            height={22}
            rx={5}
            fill="#ffffff"
            fillOpacity={0.94}
            stroke={isSelected ? '#4f46e5' : '#e2e8f0'}
            strokeWidth={isSelected ? 1.2 : 0.8}
          />
          <text
            x={0}
            y={1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={isSelected ? '#312e81' : '#1e293b'}
            fontSize={12.5}
            style={{ fontFamily: 'var(--font-sketch)' }}
            className="select-none"
          >
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
});

const SketchNodeItem = React.memo(function SketchNodeItem({
  node,
  isSelected,
  isConnectOrigin,
  showPorts,
  onPointerDown,
  onDoubleClick,
  onPortPointerDown,
  onHoverChange,
}: {
  node: InfraNode;
  isSelected: boolean;
  isConnectOrigin: boolean;
  showPorts: boolean;
  onPointerDown: (e: React.PointerEvent, node: InfraNode) => void;
  onDoubleClick: (e: React.MouseEvent, node: InfraNode) => void;
  onPortPointerDown: (e: React.PointerEvent, node: InfraNode, side: AnchorSide) => void;
  onHoverChange: (id: string | null) => void;
}) {
  const theme = COLOR_THEMES[node.colorTheme] ?? COLOR_THEMES.slate;
  const iconPaths = ICON_PATHS[node.iconKey] ?? ICON_PATHS.server;

  const paths = useMemo(
    () => generateNodeSketchPaths(node.width, node.height, theme.fill, theme.stroke, node.seed),
    [node.width, node.height, theme.fill, theme.stroke, node.seed]
  );

  const iconBoxSize = 36;
  const iconBoxX = 12;
  const iconBoxY = (node.height - iconBoxSize) / 2;
  const textX = iconBoxX + iconBoxSize + 10;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onMouseEnter={() => onHoverChange(node.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      {/* Interactive Node Body */}
      <g
        onPointerDown={(e) => onPointerDown(e, node)}
        onDoubleClick={(e) => onDoubleClick(e, node)}
        className="cursor-grab active:cursor-grabbing"
      >
        {/* Solid hit area */}
        <rect x={0} y={0} width={node.width} height={node.height} rx={12} fill="transparent" />

        {/* RoughJS hand-drawn card */}
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.fill === 'none' ? 'none' : p.fill}
            stroke={p.stroke === 'none' ? 'none' : p.stroke}
            strokeWidth={p.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Icon Box */}
        <rect
          x={iconBoxX}
          y={iconBoxY}
          width={iconBoxSize}
          height={iconBoxSize}
          rx={8}
          fill={theme.iconBg}
        />
        <g
          transform={`translate(${iconBoxX + 7}, ${iconBoxY + 7}) scale(${22 / 24})`}
          fill="none"
          stroke={theme.iconColor}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {iconPaths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>

        {/* Clip region for clean single-line text truncation inside node */}
        <clipPath id={`clip-${node.id}`}>
          <rect x={textX} y={6} width={node.width - textX - 10} height={node.height - 12} />
        </clipPath>

        <g clipPath={`url(#clip-${node.id})`}>
          <text
            x={textX}
            y={node.sublabel ? node.height / 2 - 7 : node.height / 2 + 1}
            dominantBaseline="middle"
            fill="#0f172a"
            fontSize={14}
            fontWeight={600}
            style={{ fontFamily: 'var(--font-sketch)' }}
            className="select-none"
          >
            {node.label}
          </text>
          {node.sublabel && (
            <text
              x={textX}
              y={node.height / 2 + 13}
              dominantBaseline="middle"
              fill="#64748b"
              fontSize={10.5}
              style={{ fontFamily: 'var(--font-mono)' }}
              className="select-none"
            >
              {node.sublabel}
            </text>
          )}
        </g>
      </g>

      {/* Selection or Connect Origin Highlight */}
      {(isSelected || isConnectOrigin) && (
        <rect
          x={-4}
          y={-4}
          width={node.width + 8}
          height={node.height + 8}
          rx={14}
          fill="none"
          stroke={isConnectOrigin ? '#0284c7' : '#4f46e5'}
          strokeWidth={1.75}
          strokeDasharray="5 3"
          className="pointer-events-none"
        />
      )}

      {/* 4 Anchor Connection Ports */}
      {showPorts &&
        ANCHOR_SIDES.map((side) => {
          const pt = getAnchorPoint({ ...node, x: 0, y: 0 }, side);
          return (
            <g key={side} transform={`translate(${pt.x}, ${pt.y})`}>
              {/* Expanded hit area for easy port grabbing */}
              <circle
                r={10}
                fill="transparent"
                className="cursor-crosshair"
                onPointerDown={(e) => onPortPointerDown(e, node, side)}
              />
              <circle
                r={4.5}
                fill="#ffffff"
                stroke="#4f46e5"
                strokeWidth={2}
                className="pointer-events-none"
              />
            </g>
          );
        })}
    </g>
  );
});

export function Canvas({
  doc,
  viewport,
  onViewportChange,
  toolMode,
  onToolModeChange,
  selection,
  onSelectionChange,
  snapToGrid,
  onToggleSnapToGrid,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onQuickAddVpc,
  onDropCatalogItem,
  onTransientUpdateNode,
  onTransientUpdateGroup,
  onCommitDocument,
  onUpdateNodeLabel,
  onUpdateGroupLabel,
  onUpdateEdgeLabel,
  onCreateEdge,
  onDeleteSelected,
  onClearCanvas,
  onFitToView,
  onLoadStarterTemplate,
  canvasContainerRef,
}: CanvasProps) {
  const dragRef = useRef<DragState | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // For click-to-connect in Connect tool mode OR drag-from-port
  const [draftEdge, setDraftEdge] = useState<{
    sourceNodeId: string;
    sourceAnchor: AnchorSide;
    currentWorld: Point;
    hoverTargetId?: string;
    hoverTargetAnchor?: AnchorSide;
  } | null>(null);

  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);

  const nodeMap = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc.nodes]);

  // Track Spacebar for temporary pan mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingInInput(e.target)) {
        e.preventDefault();
        setSpacePressed(true);
      }
      if (e.key === 'Escape') {
        setDraftEdge(null);
        setInlineEdit(null);
        setConfirmClearOpen(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const isTypingInInput = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  };

  const clientToWorld = (clientX: number, clientY: number): Point => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - viewport.panX) / viewport.zoom,
      y: (clientY - rect.top - viewport.panY) / viewport.zoom,
    };
  };

  const findNodeAtPoint = (pt: Point, excludeId?: string): InfraNode | null => {
    for (let i = doc.nodes.length - 1; i >= 0; i--) {
      const n = doc.nodes[i];
      if (n.id === excludeId) continue;
      if (pt.x >= n.x - 10 && pt.x <= n.x + n.width + 10 && pt.y >= n.y - 10 && pt.y <= n.y + n.height + 10) {
        return n;
      }
    }
    return null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    // Zoom with Ctrl/Meta or mouse wheel directly
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.91;
    onViewportChange((prev) => {
      const nextZoom = Math.min(2.2, Math.max(0.35, Number((prev.zoom * zoomFactor).toFixed(3))));
      const ratio = nextZoom / prev.zoom;
      return {
        zoom: nextZoom,
        panX: pointerX - (pointerX - prev.panX) * ratio,
        panY: pointerY - (pointerY - prev.panY) * ratio,
      };
    });
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (inlineEdit) {
      commitInlineEdit();
    }
    setConfirmClearOpen(false);

    // Cancel pending connect-mode click if clicking empty space
    if (toolMode === 'connect' && draftEdge && !dragRef.current) {
      setDraftEdge(null);
      return;
    }

    // Pan when middle-clicking, holding space, using Pan tool, or dragging empty background
    if (e.button === 1 || e.button === 0) {
      if (!spacePressed && toolMode === 'select') {
        onSelectionChange(null);
      }
      const world = clientToWorld(e.clientX, e.clientY);
      dragRef.current = {
        kind: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startWorldX: world.x,
        startWorldY: world.y,
        originPanX: viewport.panX,
        originPanY: viewport.panY,
      };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
  };

  const handleNodePointerDown = (e: React.PointerEvent, node: InfraNode) => {
    e.stopPropagation();
    if (inlineEdit) commitInlineEdit();
    setConfirmClearOpen(false);

    if (spacePressed || toolMode === 'pan' || e.button === 1) {
      handleCanvasPointerDown(e);
      return;
    }

    // Connector Tool Click-to-Connect flow
    if (toolMode === 'connect') {
      if (!draftEdge) {
        const world = clientToWorld(e.clientX, e.clientY);
        const anchor = pickClosestAnchor(node, world);
        setDraftEdge({
          sourceNodeId: node.id,
          sourceAnchor: anchor,
          currentWorld: world,
        });
      } else if (draftEdge.sourceNodeId !== node.id) {
        const srcNode = nodeMap.get(draftEdge.sourceNodeId);
        if (srcNode) {
          const { sourceAnchor, targetAnchor } = pickBestAnchorPair(srcNode, node);
          onCreateEdge(srcNode.id, sourceAnchor, node.id, targetAnchor);
        }
        setDraftEdge(null);
        onToolModeChange('select');
      } else {
        setDraftEdge(null);
      }
      return;
    }

    onSelectionChange({ kind: 'node', id: node.id });
    const world = clientToWorld(e.clientX, e.clientY);
    dragRef.current = {
      kind: 'node',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: world.x,
      startWorldY: world.y,
      targetId: node.id,
      originX: node.x,
      originY: node.y,
      beforeSnapshot: doc,
      hasMoved: false,
    };
  };

  const handlePortPointerDown = (e: React.PointerEvent, node: InfraNode, side: AnchorSide) => {
    e.stopPropagation();
    if (inlineEdit) commitInlineEdit();
    const startPt = getAnchorPoint(node, side);
    dragRef.current = {
      kind: 'connect',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: startPt.x,
      startWorldY: startPt.y,
      sourceNodeId: node.id,
      sourceAnchor: side,
    };
    setDraftEdge({
      sourceNodeId: node.id,
      sourceAnchor: side,
      currentWorld: startPt,
    });
  };

  const handleGroupPointerDown = (e: React.PointerEvent, group: InfraGroup) => {
    e.stopPropagation();
    if (inlineEdit) commitInlineEdit();
    setConfirmClearOpen(false);

    if (spacePressed || toolMode === 'pan' || e.button === 1) {
      handleCanvasPointerDown(e);
      return;
    }

    if (toolMode === 'connect') return;

    onSelectionChange({ kind: 'group', id: group.id });
    const world = clientToWorld(e.clientX, e.clientY);
    dragRef.current = {
      kind: 'group',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: world.x,
      startWorldY: world.y,
      targetId: group.id,
      originX: group.x,
      originY: group.y,
      beforeSnapshot: doc,
      hasMoved: false,
    };
  };

  const handleGroupResizeStart = (e: React.PointerEvent, group: InfraGroup, corner: ResizeCorner) => {
    e.stopPropagation();
    const world = clientToWorld(e.clientX, e.clientY);
    dragRef.current = {
      kind: 'resize-group',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: world.x,
      startWorldY: world.y,
      targetId: group.id,
      originX: group.x,
      originY: group.y,
      originW: group.width,
      originH: group.height,
      resizeCorner: corner,
      beforeSnapshot: doc,
      hasMoved: false,
    };
  };

  const handleEdgePointerDown = (e: React.PointerEvent, edge: InfraEdge) => {
    e.stopPropagation();
    if (inlineEdit) commitInlineEdit();
    setConfirmClearOpen(false);
    if (spacePressed || toolMode === 'pan') {
      handleCanvasPointerDown(e);
      return;
    }
    onSelectionChange({ kind: 'edge', id: edge.id });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const world = clientToWorld(e.clientX, e.clientY);

    // Update live preview line in click-to-connect mode
    if (toolMode === 'connect' && draftEdge && !dragRef.current) {
      const targetNode = findNodeAtPoint(world, draftEdge.sourceNodeId);
      setDraftEdge((prev) =>
        prev
          ? {
              ...prev,
              currentWorld: world,
              hoverTargetId: targetNode?.id,
              hoverTargetAnchor: targetNode ? pickClosestAnchor(targetNode, world) : undefined,
            }
          : null
      );
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      onViewportChange((prev) => ({
        ...prev,
        panX: (drag.originPanX ?? 0) + dx,
        panY: (drag.originPanY ?? 0) + dy,
      }));
      return;
    }

    if (drag.kind === 'node' && drag.targetId) {
      const dx = world.x - drag.startWorldX;
      const dy = world.y - drag.startWorldY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.hasMoved = true;
      const nx = snapValue((drag.originX ?? 0) + dx, snapToGrid);
      const ny = snapValue((drag.originY ?? 0) + dy, snapToGrid);
      onTransientUpdateNode(drag.targetId, { x: nx, y: ny });
      return;
    }

    if (drag.kind === 'group' && drag.targetId) {
      const dx = world.x - drag.startWorldX;
      const dy = world.y - drag.startWorldY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.hasMoved = true;
      const gx = snapValue((drag.originX ?? 0) + dx, snapToGrid);
      const gy = snapValue((drag.originY ?? 0) + dy, snapToGrid);
      onTransientUpdateGroup(drag.targetId, { x: gx, y: gy });
      return;
    }

    if (drag.kind === 'resize-group' && drag.targetId && drag.resizeCorner) {
      const dx = world.x - drag.startWorldX;
      const dy = world.y - drag.startWorldY;
      drag.hasMoved = true;
      const minW = 200;
      const minH = 130;

      let nx = drag.originX ?? 0;
      let ny = drag.originY ?? 0;
      let nw = drag.originW ?? 320;
      let nh = drag.originH ?? 220;

      if (drag.resizeCorner === 'se') {
        nw = Math.max(minW, snapValue(nw + dx, snapToGrid));
        nh = Math.max(minH, snapValue(nh + dy, snapToGrid));
      } else if (drag.resizeCorner === 'ne') {
        nw = Math.max(minW, snapValue(nw + dx, snapToGrid));
        const nextY = snapValue(ny + dy, snapToGrid);
        const maxY = ny + nh - minH;
        const clampedY = Math.min(nextY, maxY);
        nh = ny + nh - clampedY;
        ny = clampedY;
      } else if (drag.resizeCorner === 'sw') {
        const nextX = snapValue(nx + dx, snapToGrid);
        const maxX = nx + nw - minW;
        const clampedX = Math.min(nextX, maxX);
        nw = nx + nw - clampedX;
        nx = clampedX;
        nh = Math.max(minH, snapValue(nh + dy, snapToGrid));
      } else if (drag.resizeCorner === 'nw') {
        const nextX = snapValue(nx + dx, snapToGrid);
        const maxX = nx + nw - minW;
        const clampedX = Math.min(nextX, maxX);
        nw = nx + nw - clampedX;
        nx = clampedX;

        const nextY = snapValue(ny + dy, snapToGrid);
        const maxY = ny + nh - minH;
        const clampedY = Math.min(nextY, maxY);
        nh = ny + nh - clampedY;
        ny = clampedY;
      }

      onTransientUpdateGroup(drag.targetId, { x: nx, y: ny, width: nw, height: nh });
      return;
    }

    if (drag.kind === 'connect' && drag.sourceNodeId && drag.sourceAnchor) {
      const targetNode = findNodeAtPoint(world, drag.sourceNodeId);
      setDraftEdge({
        sourceNodeId: drag.sourceNodeId,
        sourceAnchor: drag.sourceAnchor,
        currentWorld: world,
        hoverTargetId: targetNode?.id,
        hoverTargetAnchor: targetNode ? pickClosestAnchor(targetNode, world) : undefined,
      });
    }
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    if ((drag.kind === 'node' || drag.kind === 'group' || drag.kind === 'resize-group') && drag.hasMoved && drag.beforeSnapshot) {
      onCommitDocument(drag.beforeSnapshot);
    }

    if (drag.kind === 'connect' && draftEdge) {
      if (draftEdge.hoverTargetId && draftEdge.hoverTargetAnchor && draftEdge.sourceNodeId !== draftEdge.hoverTargetId) {
        onCreateEdge(
          draftEdge.sourceNodeId,
          draftEdge.sourceAnchor,
          draftEdge.hoverTargetId,
          draftEdge.hoverTargetAnchor
        );
      }
      setDraftEdge(null);
    }
  };

  // Drag-and-drop from Catalog Sidebar
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/infrasketch-item')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!isDragOver) setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const payload = e.dataTransfer.getData('application/infrasketch-item');
    if (!payload) return;
    const world = clientToWorld(e.clientX, e.clientY);
    onDropCatalogItem(payload, world.x, world.y);
  };

  // Double-click inline label editing
  const handleNodeDoubleClick = (e: React.MouseEvent, node: InfraNode) => {
    e.stopPropagation();
    setInlineEdit({
      kind: 'node',
      id: node.id,
      value: node.label,
      worldX: node.x + 54,
      worldY: node.y + node.height / 2 - 14,
      width: node.width - 62,
    });
  };

  const handleGroupDoubleClick = (e: React.MouseEvent, group: InfraGroup) => {
    e.stopPropagation();
    setInlineEdit({
      kind: 'group',
      id: group.id,
      value: group.label,
      worldX: group.x + 10,
      worldY: group.y - 30,
      width: 200,
    });
  };

  const handleEdgeDoubleClick = (e: React.MouseEvent, edge: InfraEdge, midpoint: Point) => {
    e.stopPropagation();
    setInlineEdit({
      kind: 'edge',
      id: edge.id,
      value: edge.label,
      worldX: midpoint.x - 70,
      worldY: midpoint.y - 14,
      width: 140,
    });
  };

  const commitInlineEdit = () => {
    if (!inlineEdit) return;
    const val = inlineEdit.value.trim();
    if (inlineEdit.kind === 'node' && val) {
      onUpdateNodeLabel(inlineEdit.id, val);
    } else if (inlineEdit.kind === 'group' && val) {
      onUpdateGroupLabel(inlineEdit.id, val);
    } else if (inlineEdit.kind === 'edge') {
      onUpdateEdgeLabel(inlineEdit.id, val);
    }
    setInlineEdit(null);
  };

  const adjustZoom = (delta: number) => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    onViewportChange((prev) => {
      const nextZoom = Math.min(2.2, Math.max(0.35, Number((prev.zoom + delta).toFixed(2))));
      const ratio = nextZoom / prev.zoom;
      return {
        zoom: nextZoom,
        panX: cx - (cx - prev.panX) * ratio,
        panY: cy - (cy - prev.panY) * ratio,
      };
    });
  };

  const resetZoom100 = () => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    onViewportChange((prev) => {
      const ratio = 1 / prev.zoom;
      return {
        zoom: 1,
        panX: cx - (cx - prev.panX) * ratio,
        panY: cy - (cy - prev.panY) * ratio,
      };
    });
  };

  // Compute live draft connector start & end points
  const draftConnectorCoords = useMemo(() => {
    if (!draftEdge) return null;
    const srcNode = nodeMap.get(draftEdge.sourceNodeId);
    if (!srcNode) return null;
    const start = getAnchorPoint(srcNode, draftEdge.sourceAnchor);
    let end = draftEdge.currentWorld;
    if (draftEdge.hoverTargetId && draftEdge.hoverTargetAnchor) {
      const tgt = nodeMap.get(draftEdge.hoverTargetId);
      if (tgt) end = getAnchorPoint(tgt, draftEdge.hoverTargetAnchor);
    }
    return { start, end };
  }, [draftEdge, nodeMap]);

  const isEmpty = doc.nodes.length === 0 && doc.groups.length === 0;
  const dotSpacing = Math.max(12, 20 * viewport.zoom);
  const canvasCursor = spacePressed || toolMode === 'pan'
    ? 'cursor-grab active:cursor-grabbing'
    : toolMode === 'connect'
      ? 'cursor-crosshair'
      : 'cursor-default';

  return (
    <div
      ref={canvasContainerRef}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative flex-1 h-full overflow-hidden bg-[#fbfcfe] ${canvasCursor}`}
      style={{
        backgroundImage: 'radial-gradient(circle, #cbd5e1 1.15px, transparent 1.15px)',
        backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
        backgroundPosition: `${viewport.panX}px ${viewport.panY}px`,
      }}
    >
      {/* Drop Highlight Ring */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/20 z-30 transition-opacity" />
      )}

      {/* Floating Top-Center Excalidraw-Style Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1.5 py-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => {
            onToolModeChange('select');
            setDraftEdge(null);
          }}
          title="Pilih & Geser (V)"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            toolMode === 'select'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MousePointer2 className="w-3.5 h-3.5" />
          <span>Pilih</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onToolModeChange('pan');
            setDraftEdge(null);
          }}
          title="Geser Kanvas (H atau tahan Spasi)"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            toolMode === 'pan'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Hand className="w-3.5 h-3.5" />
          <span>Geser</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onToolModeChange(toolMode === 'connect' ? 'select' : 'connect');
            setDraftEdge(null);
          }}
          title="Hubungkan Komponen dengan Panah (C)"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            toolMode === 'connect'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MoveUpRight className="w-3.5 h-3.5" />
          <span>Konektor</span>
        </button>

        <button
          type="button"
          onClick={onQuickAddVpc}
          title="Tambah Container VPC (G)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
        >
          <BoxSelect className="w-3.5 h-3.5" />
          <span>VPC</span>
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1" aria-hidden="true" />

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Urungkan (Ctrl+Z)"
          aria-label="Urungkan"
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Ulangi (Ctrl+Y)"
          aria-label="Ulangi"
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1" aria-hidden="true" />

        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={!selection}
          title="Hapus Elemen Terpilih (Delete)"
          aria-label="Hapus elemen terpilih"
          className="p-1.5 rounded-lg text-slate-600 hover:text-rose-700 hover:bg-rose-50 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setConfirmClearOpen((v) => !v)}
            disabled={isEmpty}
            title="Kosongkan Kanvas"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-rose-700 hover:bg-rose-50 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
          >
            Reset
          </button>

          {confirmClearOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50">
              <p className="text-xs text-slate-700 leading-relaxed">
                Hapus semua komponen dan konektor di kanvas ini?
              </p>
              <div className="mt-2.5 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(false)}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearCanvas();
                    setConfirmClearOpen(false);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md cursor-pointer"
                >
                  Ya, Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subtle contextual prompt when Connect tool is active */}
      {toolMode === 'connect' && (
        <div className="absolute top-[70px] left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-lg shadow-sm pointer-events-none whitespace-nowrap">
          {draftEdge
            ? 'Klik komponen tujuan untuk menyelesaikan panah (Esc untuk batal)'
            : 'Klik komponen awal, lalu klik komponen tujuan'}
        </div>
      )}

      {/* Main SVG Sketch Viewport */}
      <svg
        className="w-full h-full block"
        onPointerDown={handleCanvasPointerDown}
      >
        <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
          {/* Layer 1: VPC / Subnet / Cluster Group Containers */}
          <g>
            {doc.groups.map((group) => (
              <SketchGroupItem
                key={group.id}
                group={group}
                isSelected={selection?.kind === 'group' && selection.id === group.id}
                onPointerDown={handleGroupPointerDown}
                onDoubleClick={handleGroupDoubleClick}
                onResizeStart={handleGroupResizeStart}
              />
            ))}
          </g>

          {/* Layer 2: Labeled Connector Edges */}
          <g>
            {doc.edges.map((edge) => {
              const sourceNode = nodeMap.get(edge.sourceId);
              const targetNode = nodeMap.get(edge.targetId);
              if (!sourceNode || !targetNode) return null;
              return (
                <SketchEdgeItem
                  key={edge.id}
                  edge={edge}
                  sourceNode={sourceNode}
                  targetNode={targetNode}
                  isSelected={selection?.kind === 'edge' && selection.id === edge.id}
                  onSelect={handleEdgePointerDown}
                  onDoubleClick={handleEdgeDoubleClick}
                />
              );
            })}
          </g>

          {/* Layer 3: Cloud Service Nodes */}
          <g>
            {doc.nodes.map((node) => {
              const isSelected = selection?.kind === 'node' && selection.id === node.id;
              const isConnectOrigin = draftEdge?.sourceNodeId === node.id;
              const showPorts =
                isSelected ||
                hoveredNodeId === node.id ||
                toolMode === 'connect' ||
                Boolean(draftEdge);

              return (
                <SketchNodeItem
                  key={node.id}
                  node={node}
                  isSelected={isSelected}
                  isConnectOrigin={isConnectOrigin}
                  showPorts={showPorts}
                  onPointerDown={handleNodePointerDown}
                  onDoubleClick={handleNodeDoubleClick}
                  onPortPointerDown={handlePortPointerDown}
                  onHoverChange={setHoveredNodeId}
                />
              );
            })}
          </g>

          {/* Layer 4: Live Draft Connector Line */}
          {draftConnectorCoords && (
            <g className="pointer-events-none">
              <line
                x1={draftConnectorCoords.start.x}
                y1={draftConnectorCoords.start.y}
                x2={draftConnectorCoords.end.x}
                y2={draftConnectorCoords.end.y}
                stroke="#4f46e5"
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeLinecap="round"
              />
              <circle
                cx={draftConnectorCoords.end.x}
                cy={draftConnectorCoords.end.y}
                r={5}
                fill="#4f46e5"
              />
            </g>
          )}
        </g>
      </svg>

      {/* Inline Label Editor Overlay (on Double-Click) */}
      {inlineEdit && (
        <input
          type="text"
          autoFocus
          value={inlineEdit.value}
          onChange={(e) => setInlineEdit((prev) => (prev ? { ...prev, value: e.target.value } : null))}
          onBlur={commitInlineEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInlineEdit();
            if (e.key === 'Escape') setInlineEdit(null);
          }}
          style={{
            left: inlineEdit.worldX * viewport.zoom + viewport.panX,
            top: inlineEdit.worldY * viewport.zoom + viewport.panY,
            width: Math.max(120, inlineEdit.width * viewport.zoom),
            fontFamily: 'var(--font-sketch)',
          }}
          className="absolute z-40 px-2 py-1 text-sm bg-white text-slate-900 border-2 border-indigo-500 rounded-md shadow-md outline-none"
        />
      )}

      {/* Clean Empty Canvas State */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-md text-center bg-white/95 border border-slate-200 rounded-2xl p-6 shadow-xs">
            <h3 className="text-base font-semibold text-slate-900">Kanvas Infrastruktur Kosong</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Seret komponen cloud atau VPC dari sidebar kiri ke kanvas, atau mulai cepat dengan template arsitektur siap pakai.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onLoadStarterTemplate('three-tier')}
                className="px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Muat 3-Tier Web App
              </button>
              <button
                type="button"
                onClick={() => onLoadStarterTemplate('microservices-k8s')}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Muat Microservices K8s
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom-Left Viewport Controls */}
      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1.5 py-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => adjustZoom(-0.15)}
          title="Perkecil"
          aria-label="Perkecil kanvas"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={resetZoom100}
          title="Reset zoom ke 100%"
          className="px-2 py-1 text-xs font-mono tabular-nums text-slate-700 hover:bg-slate-100 rounded-md min-w-[50px] text-center cursor-pointer"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>

        <button
          type="button"
          onClick={() => adjustZoom(0.15)}
          title="Perbesar"
          aria-label="Perbesar kanvas"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-200 mx-1" aria-hidden="true" />

        <button
          type="button"
          onClick={onFitToView}
          title="Paskan seluruh diagram ke layar"
          aria-label="Paskan diagram ke layar"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleSnapToGrid}
          title={snapToGrid ? 'Snap ke grid aktif' : 'Snap ke grid nonaktif'}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            snapToGrid
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          <span>Snap</span>
        </button>
      </div>

      {/* Subtle Bottom-Right Interaction Hint */}
      <div className="hidden lg:flex absolute bottom-4 right-4 z-20 items-center gap-2 text-[11px] text-slate-400 pointer-events-none">
        <span>Double-klik untuk edit teks</span>
        <span aria-hidden="true">·</span>
        <span>Tarik titik sisi node untuk konektor</span>
      </div>
    </div>
  );
}
