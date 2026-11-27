import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BoxSelect,
  Grid3X3,
  Hand,
  HelpCircle,
  Lock,
  Maximize2,
  Minus,
  MousePointer2,
  MoveUpRight,
  Plus,
  Redo2,
  StickyNote,
  Trash2,
  Undo2,
} from 'lucide-react';
import { COLOR_THEMES, ICON_PATHS } from '../data/catalog';
import {
  AnchorSide,
  DiagramDocument,
  EndpointKind,
  InfraEdge,
  InfraGroup,
  InfraNode,
  InfraText,
  Selection,
  ToolMode,
  Viewport,
} from '../types/diagram';
import { selectionHas, toggleSelectionItem } from '../utils/diagramOps';
import {
  computeEdgeGeometry,
  getAnchorPoint,
  getGroupDescendantIds,
  pickClosestAnchor,
  Point,
  RectBox,
  rectIntersects,
  resolveEdgeEndpoint,
  snapValue,
} from '../utils/geometry';
import {
  generateEdgeSketchPaths,
  generateGroupSketchPaths,
  generateNodeSketchPaths,
  generateNoteSketchPaths,
} from '../utils/roughSvg';
import { ContextMenuState } from './ContextMenu';

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
  onCreateTextAt: (worldX: number, worldY: number, variant?: 'note' | 'text') => string;
  onDropCatalogItem: (rawPayload: string, worldX: number, worldY: number) => void;
  onTransientDocument: (updater: (prev: DiagramDocument) => DiagramDocument) => void;
  onCommitDragMove: (beforeSnapshot: DiagramDocument, movedSelection: Selection) => void;
  onCommitDocument: (beforeSnapshot: DiagramDocument) => void;
  onRevertTransient: (beforeSnapshot: DiagramDocument) => void;
  onDuplicateForDrag: (
    baseDoc: DiagramDocument,
    targetSelection: Selection
  ) => { nextDoc: DiagramDocument; clonedSelection: Selection };
  onUpdateNodeLabel: (id: string, label: string) => void;
  onUpdateGroupLabel: (id: string, label: string) => void;
  onUpdateEdgeLabel: (id: string, label: string) => void;
  onUpdateTextContent: (id: string, text: string) => void;
  onCreateEdge: (
    sourceId: string,
    sourceKind: EndpointKind,
    sourceAnchor: AnchorSide,
    targetId: string,
    targetKind: EndpointKind,
    targetAnchor: AnchorSide
  ) => void;
  onReconnectEdge: (
    edgeId: string,
    end: 'source' | 'target',
    endpointId: string,
    endpointKind: EndpointKind,
    anchor: AnchorSide
  ) => void;
  onDeleteSelected: () => void;
  onClearCanvas: () => void;
  onFitToView: () => void;
  onLoadStarterTemplate: (templateId: string) => void;
  onOpenShortcutHelp: () => void;
  onOpenContextMenu: (menu: ContextMenuState) => void;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
}

const ANCHOR_SIDES: AnchorSide[] = ['top', 'right', 'bottom', 'left'];
type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

interface OriginItemSnapshot {
  kind: 'node' | 'group' | 'text';
  id: string;
  x: number;
  y: number;
}

interface DragState {
  kind: 'pan' | 'marquee' | 'move' | 'resize' | 'connect' | 'reconnect-edge';
  pointerId: number;
  captureTarget: Element;
  startClientX: number;
  startClientY: number;
  startWorldX: number;
  startWorldY: number;
  originPanX?: number;
  originPanY?: number;
  // Move + Ctrl/Alt-drag duplicate
  duplicateOnDrag?: boolean;
  hasCloned?: boolean;
  pendingSelection?: Selection;
  collapseSelectionOnClick?: { kind: 'node' | 'group' | 'text'; id: string };
  moveOrigins?: OriginItemSnapshot[];
  // Resize
  resizeKind?: 'node' | 'group' | 'text';
  targetId?: string;
  originX?: number;
  originY?: number;
  originW?: number;
  originH?: number;
  resizeCorner?: ResizeCorner;
  // Connect / Reconnect
  sourceId?: string;
  sourceKind?: EndpointKind;
  sourceAnchor?: AnchorSide;
  reconnectEdgeId?: string;
  reconnectEnd?: 'source' | 'target';
  fixedEndpoint?: { id: string; kind: EndpointKind; anchor: AnchorSide };
  beforeSnapshot?: DiagramDocument;
  hasMoved?: boolean;
}

interface DraftEdgeState {
  sourceId: string;
  sourceKind: EndpointKind;
  sourceAnchor: AnchorSide;
  currentWorld: Point;
  hoverTargetId?: string;
  hoverTargetKind?: EndpointKind;
  hoverTargetAnchor?: AnchorSide;
}

interface InlineEditState {
  kind: 'node' | 'group' | 'edge' | 'text';
  id: string;
  value: string;
  worldX: number;
  worldY: number;
  width: number;
  height?: number;
  multiline?: boolean;
}

function isTypingInInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function computeResizedBox(
  corner: ResizeCorner,
  originX: number,
  originY: number,
  originW: number,
  originH: number,
  dx: number,
  dy: number,
  minW: number,
  minH: number,
  snapToGrid: boolean
): { x: number; y: number; width: number; height: number } {
  let nx = originX;
  let ny = originY;
  let nw = originW;
  let nh = originH;

  if (corner === 'se') {
    nw = Math.max(minW, snapValue(nw + dx, snapToGrid));
    nh = Math.max(minH, snapValue(nh + dy, snapToGrid));
  } else if (corner === 'ne') {
    nw = Math.max(minW, snapValue(nw + dx, snapToGrid));
    const nextY = snapValue(ny + dy, snapToGrid);
    const clampedY = Math.min(nextY, ny + nh - minH);
    nh = ny + nh - clampedY;
    ny = clampedY;
  } else if (corner === 'sw') {
    const nextX = snapValue(nx + dx, snapToGrid);
    const clampedX = Math.min(nextX, nx + nw - minW);
    nw = nx + nw - clampedX;
    nx = clampedX;
    nh = Math.max(minH, snapValue(nh + dy, snapToGrid));
  } else {
    const nextX = snapValue(nx + dx, snapToGrid);
    const clampedX = Math.min(nextX, nx + nw - minW);
    nw = nx + nw - clampedX;
    nx = clampedX;

    const nextY = snapValue(ny + dy, snapToGrid);
    const clampedY = Math.min(nextY, ny + nh - minH);
    nh = ny + nh - clampedY;
    ny = clampedY;
  }

  return { x: nx, y: ny, width: nw, height: nh };
}

const SketchGroupItem = React.memo(function SketchGroupItem({
  group,
  isSelected,
  showResizeHandles,
  isConnectOrigin,
  showPorts,
  onPointerDown,
  onDoubleClick,
  onContextMenu,
  onResizeStart,
  onPortPointerDown,
  onHoverChange,
}: {
  group: InfraGroup;
  isSelected: boolean;
  showResizeHandles: boolean;
  isConnectOrigin: boolean;
  showPorts: boolean;
  onPointerDown: (e: React.PointerEvent, group: InfraGroup) => void;
  onDoubleClick: (e: React.MouseEvent, group: InfraGroup) => void;
  onContextMenu: (e: React.MouseEvent, kind: 'group', id: string) => void;
  onResizeStart: (e: React.PointerEvent, group: InfraGroup, corner: ResizeCorner) => void;
  onPortPointerDown: (e: React.PointerEvent, id: string, kind: EndpointKind, box: RectBox, side: AnchorSide) => void;
  onHoverChange: (key: string | null) => void;
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
    <g
      transform={`translate(${group.x}, ${group.y})`}
      onMouseEnter={() => onHoverChange(`group:${group.id}`)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <g
        onPointerDown={(e) => onPointerDown(e, group)}
        onDoubleClick={(e) => onDoubleClick(e, group)}
        onContextMenu={(e) => onContextMenu(e, 'group', group.id)}
        className={group.locked ? 'cursor-default' : 'cursor-move'}
      >
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

      {group.locked && (
        <g transform={`translate(${group.width - 22}, 8)`} className="pointer-events-none opacity-60">
          <Lock width={13} height={13} color={theme.stroke} />
        </g>
      )}

      {(isSelected || isConnectOrigin) && (
        <rect
          x={-4}
          y={-4}
          width={group.width + 8}
          height={group.height + 8}
          rx={16}
          fill="none"
          stroke={isConnectOrigin ? '#0284c7' : '#4f46e5'}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          className="pointer-events-none"
        />
      )}

      {showResizeHandles &&
        corners.map((c) => (
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

      {showPorts &&
        ANCHOR_SIDES.map((side) => {
          const pt = getAnchorPoint({ x: 0, y: 0, width: group.width, height: group.height }, side);
          return (
            <g key={side} transform={`translate(${pt.x}, ${pt.y})`}>
              <circle
                r={10}
                fill="transparent"
                className="cursor-crosshair"
                onPointerDown={(e) => onPortPointerDown(e, group.id, 'group', group, side)}
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

const SketchEdgeItem = React.memo(function SketchEdgeItem({
  edge,
  sourceBox,
  targetBox,
  isSelected,
  showReconnectHandles,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onReconnectStart,
}: {
  edge: InfraEdge;
  sourceBox: RectBox;
  targetBox: RectBox;
  isSelected: boolean;
  showReconnectHandles: boolean;
  onSelect: (e: React.PointerEvent, edge: InfraEdge) => void;
  onDoubleClick: (e: React.MouseEvent, edge: InfraEdge, midpoint: Point) => void;
  onContextMenu: (e: React.MouseEvent, kind: 'edge', id: string) => void;
  onReconnectStart: (e: React.PointerEvent, edge: InfraEdge, end: 'source' | 'target') => void;
}) {
  const theme = COLOR_THEMES[edge.colorTheme] ?? COLOR_THEMES.slate;
  const strokeColor = isSelected ? '#4f46e5' : theme.stroke;

  const geom = useMemo(
    () =>
      computeEdgeGeometry(
        {
          sourceAnchor: edge.sourceAnchor,
          targetAnchor: edge.targetAnchor,
          routing: edge.routing,
          curveType: edge.curveType,
        },
        sourceBox,
        targetBox
      ),
    [edge.sourceAnchor, edge.targetAnchor, edge.routing, edge.curveType, sourceBox, targetBox]
  );

  const paths = useMemo(
    () =>
      generateEdgeSketchPaths(
        geom,
        strokeColor,
        edge.seed,
        edge.lineStyle === 'dashed',
        edge.arrowHead
      ),
    [geom, strokeColor, edge.seed, edge.lineStyle, edge.arrowHead]
  );

  const labelWidth = edge.label.trim() ? Math.max(46, edge.label.trim().length * 7.8 + 16) : 0;

  return (
    <g
      onPointerDown={(e) => onSelect(e, edge)}
      onDoubleClick={(e) => onDoubleClick(e, edge, geom.midpoint)}
      onContextMenu={(e) => onContextMenu(e, 'edge', edge.id)}
      className="cursor-pointer group"
    >
      <path d={geom.svgPath} fill="none" stroke="transparent" strokeWidth={18} />

      {isSelected && (
        <path
          d={geom.svgPath}
          fill="none"
          stroke="rgba(79, 70, 229, 0.22)"
          strokeWidth={7}
          strokeLinecap="round"
        />
      )}

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

      {showReconnectHandles && (
        <>
          <circle
            cx={geom.start.x}
            cy={geom.start.y}
            r={6}
            fill="#ffffff"
            stroke="#4f46e5"
            strokeWidth={2}
            className="cursor-grab"
            onPointerDown={(e) => onReconnectStart(e, edge, 'source')}
          />
          <circle
            cx={geom.end.x}
            cy={geom.end.y}
            r={6}
            fill="#ffffff"
            stroke="#4f46e5"
            strokeWidth={2}
            className="cursor-grab"
            onPointerDown={(e) => onReconnectStart(e, edge, 'target')}
          />
        </>
      )}
    </g>
  );
});

const SketchNodeItem = React.memo(function SketchNodeItem({
  node,
  isSelected,
  showResizeHandles,
  isConnectOrigin,
  showPorts,
  onPointerDown,
  onDoubleClick,
  onContextMenu,
  onResizeStart,
  onPortPointerDown,
  onHoverChange,
}: {
  node: InfraNode;
  isSelected: boolean;
  showResizeHandles: boolean;
  isConnectOrigin: boolean;
  showPorts: boolean;
  onPointerDown: (e: React.PointerEvent, node: InfraNode) => void;
  onDoubleClick: (e: React.MouseEvent, node: InfraNode) => void;
  onContextMenu: (e: React.MouseEvent, kind: 'node', id: string) => void;
  onResizeStart: (e: React.PointerEvent, node: InfraNode, corner: ResizeCorner) => void;
  onPortPointerDown: (e: React.PointerEvent, id: string, kind: EndpointKind, box: RectBox, side: AnchorSide) => void;
  onHoverChange: (key: string | null) => void;
}) {
  const reactClipId = useId();
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

  const corners: Array<{ corner: ResizeCorner; cx: number; cy: number; cursor: string }> = [
    { corner: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
    { corner: 'ne', cx: node.width, cy: 0, cursor: 'nesw-resize' },
    { corner: 'se', cx: node.width, cy: node.height, cursor: 'nwse-resize' },
    { corner: 'sw', cx: 0, cy: node.height, cursor: 'nesw-resize' },
  ];

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onMouseEnter={() => onHoverChange(`node:${node.id}`)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <g
        onPointerDown={(e) => onPointerDown(e, node)}
        onDoubleClick={(e) => onDoubleClick(e, node)}
        onContextMenu={(e) => onContextMenu(e, 'node', node.id)}
        className={node.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
      >
        <rect x={0} y={0} width={node.width} height={node.height} rx={12} fill="transparent" />

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

        <rect x={iconBoxX} y={iconBoxY} width={iconBoxSize} height={iconBoxSize} rx={8} fill={theme.iconBg} />
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

        <clipPath id={reactClipId}>
          <rect x={textX} y={6} width={Math.max(20, node.width - textX - 10)} height={node.height - 12} />
        </clipPath>

        <g clipPath={`url(#${reactClipId})`}>
          <text
            x={textX}
            y={node.sublabel ? node.height / 2 - 7 : node.height / 2 + 1}
            dominantBaseline="middle"
            fill="#0f172a"
            fontSize={13}
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

      {node.locked && (
        <g transform={`translate(${node.width - 18}, 6)`} className="pointer-events-none opacity-60">
          <Lock width={11} height={11} color={theme.stroke} />
        </g>
      )}

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

      {showResizeHandles &&
        corners.map((c) => (
          <rect
            key={c.corner}
            x={c.cx - 4.5}
            y={c.cy - 4.5}
            width={9}
            height={9}
            rx={2}
            fill="#ffffff"
            stroke="#4f46e5"
            strokeWidth={1.8}
            style={{ cursor: c.cursor }}
            onPointerDown={(e) => onResizeStart(e, node, c.corner)}
          />
        ))}

      {showPorts &&
        ANCHOR_SIDES.map((side) => {
          const pt = getAnchorPoint({ x: 0, y: 0, width: node.width, height: node.height }, side);
          return (
            <g key={side} transform={`translate(${pt.x}, ${pt.y})`}>
              <circle
                r={10}
                fill="transparent"
                className="cursor-crosshair"
                onPointerDown={(e) => onPortPointerDown(e, node.id, 'node', node, side)}
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

const SketchTextItem = React.memo(function SketchTextItem({
  item,
  isSelected,
  showResizeHandles,
  onPointerDown,
  onDoubleClick,
  onContextMenu,
  onResizeStart,
}: {
  item: InfraText;
  isSelected: boolean;
  showResizeHandles: boolean;
  onPointerDown: (e: React.PointerEvent, item: InfraText) => void;
  onDoubleClick: (e: React.MouseEvent, item: InfraText) => void;
  onContextMenu: (e: React.MouseEvent, kind: 'text', id: string) => void;
  onResizeStart: (e: React.PointerEvent, item: InfraText, corner: ResizeCorner) => void;
}) {
  const clipId = useId();
  const theme = COLOR_THEMES[item.colorTheme] ?? COLOR_THEMES.amber;

  const paths = useMemo(
    () =>
      item.variant === 'note'
        ? generateNoteSketchPaths(item.width, item.height, theme.fill, theme.stroke, item.seed)
        : [],
    [item.variant, item.width, item.height, theme.fill, theme.stroke, item.seed]
  );

  const corners: Array<{ corner: ResizeCorner; cx: number; cy: number; cursor: string }> = [
    { corner: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
    { corner: 'ne', cx: item.width, cy: 0, cursor: 'nesw-resize' },
    { corner: 'se', cx: item.width, cy: item.height, cursor: 'nwse-resize' },
    { corner: 'sw', cx: 0, cy: item.height, cursor: 'nesw-resize' },
  ];

  const padX = item.variant === 'note' ? 12 : 4;
  const padY = item.variant === 'note' ? 12 : 4;
  const lines = item.text.split('\n');

  return (
    <g transform={`translate(${item.x}, ${item.y})`}>
      <g
        onPointerDown={(e) => onPointerDown(e, item)}
        onDoubleClick={(e) => onDoubleClick(e, item)}
        onContextMenu={(e) => onContextMenu(e, 'text', item.id)}
        className={item.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
      >
        <rect x={0} y={0} width={item.width} height={item.height} rx={8} fill="transparent" />

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

        <clipPath id={clipId}>
          <rect x={4} y={4} width={Math.max(20, item.width - 8)} height={Math.max(20, item.height - 8)} />
        </clipPath>

        <g clipPath={`url(#${clipId})`}>
          {lines.map((line, idx) => (
            <text
              key={idx}
              x={padX}
              y={padY + 12 + idx * 18}
              fill={item.variant === 'note' ? '#0f172a' : theme.stroke}
              fontSize={13}
              style={{ fontFamily: 'var(--font-sketch)' }}
              className="select-none"
            >
              {line || ' '}
            </text>
          ))}
        </g>
      </g>

      {item.locked && (
        <g transform={`translate(${item.width - 16}, 6)`} className="pointer-events-none opacity-60">
          <Lock width={11} height={11} color={theme.stroke} />
        </g>
      )}

      {isSelected && (
        <rect
          x={-4}
          y={-4}
          width={item.width + 8}
          height={item.height + 8}
          rx={10}
          fill="none"
          stroke="#4f46e5"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          className="pointer-events-none"
        />
      )}

      {showResizeHandles &&
        corners.map((c) => (
          <rect
            key={c.corner}
            x={c.cx - 4.5}
            y={c.cy - 4.5}
            width={9}
            height={9}
            rx={2}
            fill="#ffffff"
            stroke="#4f46e5"
            strokeWidth={1.8}
            style={{ cursor: c.cursor }}
            onPointerDown={(e) => onResizeStart(e, item, c.corner)}
          />
        ))}
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
  onCreateTextAt,
  onDropCatalogItem,
  onTransientDocument,
  onCommitDragMove,
  onCommitDocument,
  onRevertTransient,
  onDuplicateForDrag,
  onUpdateNodeLabel,
  onUpdateGroupLabel,
  onUpdateEdgeLabel,
  onUpdateTextContent,
  onCreateEdge,
  onReconnectEdge,
  onDeleteSelected,
  onClearCanvas,
  onFitToView,
  onLoadStarterTemplate,
  onOpenShortcutHelp,
  onOpenContextMenu,
  canvasContainerRef,
}: CanvasProps) {
  const dragRef = useRef<DragState | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [copyModifierPressed, setCopyModifierPressed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [draftEdge, setDraftEdge] = useState<DraftEdgeState | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) setCopyModifierPressed(true);
      if (e.code === 'Space' && !isTypingInInput(e.target)) {
        e.preventDefault();
        setSpacePressed(true);
      }
      if (e.key === 'Escape') {
        const drag = dragRef.current;
        if (drag?.beforeSnapshot) {
          onRevertTransient(drag.beforeSnapshot);
          dragRef.current = null;
        }
        setMarqueeBox(null);
        setDraftEdge(null);
        setInlineEdit(null);
        setConfirmClearOpen(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) setCopyModifierPressed(false);
      if (e.code === 'Space') setSpacePressed(false);
    };
    const onBlur = () => {
      setSpacePressed(false);
      setCopyModifierPressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [onRevertTransient]);

  const clientToWorld = (clientX: number, clientY: number): Point => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - viewport.panX) / viewport.zoom,
      y: (clientY - rect.top - viewport.panY) / viewport.zoom,
    };
  };

  const findEndpointAtPoint = (
    pt: Point,
    excludeId?: string,
    excludeKind?: EndpointKind
  ): { id: string; kind: EndpointKind; box: RectBox } | null => {
    for (let i = doc.nodes.length - 1; i >= 0; i--) {
      const n = doc.nodes[i];
      if (excludeKind === 'node' && n.id === excludeId) continue;
      if (pt.x >= n.x - 10 && pt.x <= n.x + n.width + 10 && pt.y >= n.y - 10 && pt.y <= n.y + n.height + 10) {
        return { id: n.id, kind: 'node', box: n };
      }
    }
    for (let i = doc.groups.length - 1; i >= 0; i--) {
      const g = doc.groups[i];
      if (excludeKind === 'group' && g.id === excludeId) continue;
      if (pt.x >= g.x - 10 && pt.x <= g.x + g.width + 10 && pt.y >= g.y - 10 && pt.y <= g.y + g.height + 10) {
        return { id: g.id, kind: 'group', box: g };
      }
    }
    return null;
  };

  const buildMoveOrigins = (targetDoc: DiagramDocument, sel: Selection): OriginItemSnapshot[] => {
    const groupIds = sel.filter((s) => s.kind === 'group').map((s) => s.id);
    const descendants = getGroupDescendantIds(targetDoc, groupIds);

    const gSet = new Set([...groupIds, ...descendants.groupIds]);
    const nSet = new Set([...sel.filter((s) => s.kind === 'node').map((s) => s.id), ...descendants.nodeIds]);
    const tSet = new Set([...sel.filter((s) => s.kind === 'text').map((s) => s.id), ...descendants.textIds]);

    const origins: OriginItemSnapshot[] = [];
    for (const g of targetDoc.groups) {
      if (gSet.has(g.id)) origins.push({ kind: 'group', id: g.id, x: g.x, y: g.y });
    }
    for (const n of targetDoc.nodes) {
      if (nSet.has(n.id)) origins.push({ kind: 'node', id: n.id, x: n.x, y: n.y });
    }
    for (const t of targetDoc.texts) {
      if (tSet.has(t.id)) origins.push({ kind: 'text', id: t.id, x: t.x, y: t.y });
    }
    return origins;
  };

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();

      if (e.ctrlKey || e.metaKey) {
        const pointerX = e.clientX - rect.left;
        const pointerY = e.clientY - rect.top;
        const delta = Math.max(-0.25, Math.min(0.25, -e.deltaY * 0.0025));
        const zoomFactor = 1 + delta;
        onViewportChange((prev) => {
          const nextZoom = Math.min(2.2, Math.max(0.35, Number((prev.zoom * zoomFactor).toFixed(3))));
          const ratio = nextZoom / prev.zoom;
          return {
            zoom: nextZoom,
            panX: pointerX - (pointerX - prev.panX) * ratio,
            panY: pointerY - (pointerY - prev.panY) * ratio,
          };
        });
        return;
      }

      onViewportChange((prev) => ({
        ...prev,
        panX: prev.panX - e.deltaX,
        panY: prev.panY - e.deltaY,
      }));
    };

    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [canvasContainerRef, onViewportChange]);

  const commitInlineEdit = () => {
    if (!inlineEdit) return;
    const raw = inlineEdit.value;
    const trimmed = raw.trim();
    if (inlineEdit.kind === 'node' && trimmed) {
      onUpdateNodeLabel(inlineEdit.id, trimmed);
    } else if (inlineEdit.kind === 'group' && trimmed) {
      onUpdateGroupLabel(inlineEdit.id, trimmed);
    } else if (inlineEdit.kind === 'edge') {
      onUpdateEdgeLabel(inlineEdit.id, trimmed);
    } else if (inlineEdit.kind === 'text') {
      onUpdateTextContent(inlineEdit.id, trimmed ? raw : 'Catatan');
    }
    setInlineEdit(null);
  };

  const beginCapture = (el: Element, pointerId: number) => {
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // Ignore synthetic events in tests
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (inlineEdit) commitInlineEdit();
    setConfirmClearOpen(false);

    if (toolMode === 'connect' && draftEdge && !dragRef.current) {
      setDraftEdge(null);
      return;
    }

    const world = clientToWorld(e.clientX, e.clientY);

    if (toolMode === 'text' && e.button === 0 && !spacePressed) {
      e.preventDefault();
      const id = onCreateTextAt(world.x, world.y, 'note');
      setInlineEdit({
        kind: 'text',
        id,
        value: 'Catatan baru',
        worldX: snapValue(world.x - 90, snapToGrid) + 8,
        worldY: snapValue(world.y - 36, snapToGrid) + 8,
        width: 164,
        height: 56,
        multiline: true,
      });
      return;
    }

    const shouldPan = e.button === 1 || spacePressed || toolMode === 'pan' || toolMode === 'connect';
    if (shouldPan) {
      const captureTarget = e.currentTarget as Element;
      dragRef.current = {
        kind: 'pan',
        pointerId: e.pointerId,
        captureTarget,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startWorldX: world.x,
        startWorldY: world.y,
        originPanX: viewport.panX,
        originPanY: viewport.panY,
      };
      beginCapture(captureTarget, e.pointerId);
      return;
    }

    if (e.button === 0 && toolMode === 'select') {
      if (!e.shiftKey) onSelectionChange([]);
      const captureTarget = canvasContainerRef.current ?? (e.currentTarget as Element);
      dragRef.current = {
        kind: 'marquee',
        pointerId: e.pointerId,
        captureTarget,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startWorldX: world.x,
        startWorldY: world.y,
        pendingSelection: e.shiftKey ? selection : [],
      };
      beginCapture(captureTarget, e.pointerId);
    }
  };

  const startMovableItemPointerDown = (
    e: React.PointerEvent,
    kind: 'node' | 'group' | 'text',
    item: { id: string; locked?: boolean }
  ) => {
    e.stopPropagation();
    if (inlineEdit) commitInlineEdit();
    setConfirmClearOpen(false);

    if (spacePressed || toolMode === 'pan' || e.button === 1) {
      handleCanvasPointerDown(e);
      return;
    }

    if (e.button !== 0) return;

    if (toolMode === 'connect') {
      if (kind === 'text') return;
      const box = item as unknown as RectBox;
      const world = clientToWorld(e.clientX, e.clientY);
      if (!draftEdge) {
        const anchor = pickClosestAnchor(box, world);
        setDraftEdge({
          sourceId: item.id,
          sourceKind: kind,
          sourceAnchor: anchor,
          currentWorld: world,
        });
      } else if (!(draftEdge.sourceKind === kind && draftEdge.sourceId === item.id)) {
        const targetAnchor = draftEdge.hoverTargetAnchor ?? pickClosestAnchor(box, world);
        onCreateEdge(
          draftEdge.sourceId,
          draftEdge.sourceKind,
          draftEdge.sourceAnchor,
          item.id,
          kind,
          targetAnchor
        );
        setDraftEdge(null);
        onToolModeChange('select');
      } else {
        setDraftEdge(null);
      }
      return;
    }

    const isCopyMod = e.ctrlKey || e.metaKey || e.altKey;
    const alreadySelected = selectionHas(selection, kind, item.id);

    if (e.shiftKey && !isCopyMod) {
      const nextSel = toggleSelectionItem(selection, { kind, id: item.id });
      onSelectionChange(nextSel);
      return;
    }

    const effectiveSelection: Selection = alreadySelected ? selection : [{ kind, id: item.id }];
    if (!alreadySelected && !isCopyMod) {
      onSelectionChange(effectiveSelection);
    }

    if (item.locked) {
      if (!alreadySelected) onSelectionChange([{ kind, id: item.id }]);
      return;
    }

    const world = clientToWorld(e.clientX, e.clientY);
    const captureTarget = canvasContainerRef.current ?? (e.currentTarget as Element);

    dragRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      captureTarget,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: world.x,
      startWorldY: world.y,
      duplicateOnDrag: isCopyMod,
      hasCloned: false,
      pendingSelection: effectiveSelection,
      collapseSelectionOnClick:
        alreadySelected && selection.length > 1 && !isCopyMod ? { kind, id: item.id } : undefined,
      moveOrigins: isCopyMod ? undefined : buildMoveOrigins(doc, effectiveSelection),
      beforeSnapshot: doc,
      hasMoved: false,
    };
    beginCapture(captureTarget, e.pointerId);
  };

  const handlePortPointerDown = (
    e: React.PointerEvent,
    id: string,
    kind: EndpointKind,
    box: RectBox,
    side: AnchorSide
  ) => {
    e.stopPropagation();
    if (inlineEdit) commitInlineEdit();
    if (spacePressed || toolMode === 'pan' || e.button === 1) {
      handleCanvasPointerDown(e);
      return;
    }
    const startPt = getAnchorPoint(box, side);
    const captureTarget = canvasContainerRef.current ?? (e.currentTarget as Element);
    dragRef.current = {
      kind: 'connect',
      pointerId: e.pointerId,
      captureTarget,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: startPt.x,
      startWorldY: startPt.y,
      sourceId: id,
      sourceKind: kind,
      sourceAnchor: side,
    };
    setDraftEdge({
      sourceId: id,
      sourceKind: kind,
      sourceAnchor: side,
      currentWorld: startPt,
    });
    beginCapture(captureTarget, e.pointerId);
  };

  const handleResizeStart = (
    e: React.PointerEvent,
    resizeKind: 'node' | 'group' | 'text',
    box: RectBox & { locked?: boolean },
    corner: ResizeCorner
  ) => {
    e.stopPropagation();
    if (spacePressed || toolMode === 'pan' || e.button === 1) {
      handleCanvasPointerDown(e);
      return;
    }
    if (box.locked) return;
    const world = clientToWorld(e.clientX, e.clientY);
    const captureTarget = canvasContainerRef.current ?? (e.currentTarget as Element);
    dragRef.current = {
      kind: 'resize',
      pointerId: e.pointerId,
      captureTarget,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: world.x,
      startWorldY: world.y,
      resizeKind,
      targetId: box.id,
      originX: box.x,
      originY: box.y,
      originW: box.width,
      originH: box.height,
      resizeCorner: corner,
      beforeSnapshot: doc,
      hasMoved: false,
    };
    beginCapture(captureTarget, e.pointerId);
  };

  const handleEdgePointerDown = (e: React.PointerEvent, edge: InfraEdge) => {
    e.stopPropagation();
    if (inlineEdit) commitInlineEdit();
    setConfirmClearOpen(false);
    if (spacePressed || toolMode === 'pan' || e.button === 1) {
      handleCanvasPointerDown(e);
      return;
    }
    if (e.shiftKey) {
      onSelectionChange(toggleSelectionItem(selection, { kind: 'edge', id: edge.id }));
    } else {
      onSelectionChange([{ kind: 'edge', id: edge.id }]);
    }
  };

  const handleReconnectStart = (
    e: React.PointerEvent,
    edge: InfraEdge,
    end: 'source' | 'target'
  ) => {
    e.stopPropagation();
    if (spacePressed || toolMode === 'pan') {
      handleCanvasPointerDown(e);
      return;
    }
    const fixedKind: EndpointKind =
      end === 'source' ? (edge.targetKind ?? 'node') : (edge.sourceKind ?? 'node');
    const fixedId = end === 'source' ? edge.targetId : edge.sourceId;
    const fixedAnchor = end === 'source' ? edge.targetAnchor : edge.sourceAnchor;
    const fixedBox = resolveEdgeEndpoint(doc, fixedId, fixedKind);
    if (!fixedBox) return;

    const world = clientToWorld(e.clientX, e.clientY);
    const captureTarget = canvasContainerRef.current ?? (e.currentTarget as Element);
    dragRef.current = {
      kind: 'reconnect-edge',
      pointerId: e.pointerId,
      captureTarget,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: world.x,
      startWorldY: world.y,
      reconnectEdgeId: edge.id,
      reconnectEnd: end,
      fixedEndpoint: { id: fixedId, kind: fixedKind, anchor: fixedAnchor },
    };
    setDraftEdge({
      sourceId: fixedId,
      sourceKind: fixedKind,
      sourceAnchor: fixedAnchor,
      currentWorld: world,
    });
    beginCapture(captureTarget, e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const world = clientToWorld(e.clientX, e.clientY);

    if (toolMode === 'connect' && draftEdge && !dragRef.current) {
      const target = findEndpointAtPoint(world, draftEdge.sourceId, draftEdge.sourceKind);
      setDraftEdge((prev) =>
        prev
          ? {
              ...prev,
              currentWorld: world,
              hoverTargetId: target?.id,
              hoverTargetKind: target?.kind,
              hoverTargetAnchor: target ? pickClosestAnchor(target.box, world) : undefined,
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

    if (drag.kind === 'marquee') {
      const x = Math.min(drag.startWorldX, world.x);
      const y = Math.min(drag.startWorldY, world.y);
      const width = Math.abs(world.x - drag.startWorldX);
      const height = Math.abs(world.y - drag.startWorldY);
      setMarqueeBox({ x, y, width, height });
      if (width > 3 || height > 3) {
        drag.hasMoved = true;
        const box = { x, y, width, height };
        const hits: Selection = [...(drag.pendingSelection ?? [])];
        const pushUnique = (kind: 'node' | 'group' | 'text' | 'edge', id: string) => {
          if (!selectionHas(hits, kind, id)) hits.push({ kind, id });
        };
        for (const n of doc.nodes) {
          if (rectIntersects(box, n)) pushUnique('node', n.id);
        }
        for (const t of doc.texts) {
          if (rectIntersects(box, t)) pushUnique('text', t.id);
        }
        for (const g of doc.groups) {
          // Select group if marquee encloses or intersects group
          if (rectIntersects(box, g)) pushUnique('group', g.id);
        }
        for (const edge of doc.edges) {
          const src = resolveEdgeEndpoint(doc, edge.sourceId, edge.sourceKind);
          const tgt = resolveEdgeEndpoint(doc, edge.targetId, edge.targetKind);
          if (!src || !tgt) continue;
          const geom = computeEdgeGeometry(edge, src, tgt);
          if (
            geom.midpoint.x >= box.x &&
            geom.midpoint.x <= box.x + box.width &&
            geom.midpoint.y >= box.y &&
            geom.midpoint.y <= box.y + box.height
          ) {
            pushUnique('edge', edge.id);
          }
        }
        onSelectionChange(hits);
      }
      return;
    }

    if (drag.kind === 'move') {
      const distPx = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      if (distPx <= 3 && !drag.hasMoved) return;
      drag.hasMoved = true;

      let origins = drag.moveOrigins;
      if (drag.duplicateOnDrag && !drag.hasCloned && drag.beforeSnapshot && drag.pendingSelection) {
        const { nextDoc, clonedSelection } = onDuplicateForDrag(drag.beforeSnapshot, drag.pendingSelection);
        drag.hasCloned = true;
        drag.pendingSelection = clonedSelection;
        origins = buildMoveOrigins(nextDoc, clonedSelection);
        drag.moveOrigins = origins;
        onTransientDocument(() => nextDoc);
        onSelectionChange(clonedSelection);
      }

      if (!origins || origins.length === 0) return;

      const rawDx = world.x - drag.startWorldX;
      const rawDy = world.y - drag.startWorldY;
      // Snap based on first top-level origin so relative spacing between multi-selected items stays exact
      const anchorOrigin = origins[0];
      const snappedX = snapValue(anchorOrigin.x + rawDx, snapToGrid);
      const snappedY = snapValue(anchorOrigin.y + rawDy, snapToGrid);
      const dx = snappedX - anchorOrigin.x;
      const dy = snappedY - anchorOrigin.y;

      const originMap = new Map(origins.map((o) => [`${o.kind}:${o.id}`, o]));
      onTransientDocument((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => {
          const o = originMap.get(`group:${g.id}`);
          return o ? { ...g, x: o.x + dx, y: o.y + dy } : g;
        }),
        nodes: prev.nodes.map((n) => {
          const o = originMap.get(`node:${n.id}`);
          return o ? { ...n, x: o.x + dx, y: o.y + dy } : n;
        }),
        texts: prev.texts.map((t) => {
          const o = originMap.get(`text:${t.id}`);
          return o ? { ...t, x: o.x + dx, y: o.y + dy } : t;
        }),
      }));
      return;
    }

    if (drag.kind === 'resize' && drag.targetId && drag.resizeCorner && drag.resizeKind) {
      const dx = world.x - drag.startWorldX;
      const dy = world.y - drag.startWorldY;
      drag.hasMoved = true;
      const minW = drag.resizeKind === 'group' ? 200 : drag.resizeKind === 'node' ? 110 : 100;
      const minH = drag.resizeKind === 'group' ? 130 : drag.resizeKind === 'node' ? 60 : 44;

      const nextBox = computeResizedBox(
        drag.resizeCorner,
        drag.originX ?? 0,
        drag.originY ?? 0,
        drag.originW ?? minW,
        drag.originH ?? minH,
        dx,
        dy,
        minW,
        minH,
        snapToGrid
      );

      const targetId = drag.targetId;
      const rKind = drag.resizeKind;
      onTransientDocument((prev) => ({
        ...prev,
        groups: rKind === 'group' ? prev.groups.map((g) => (g.id === targetId ? { ...g, ...nextBox } : g)) : prev.groups,
        nodes: rKind === 'node' ? prev.nodes.map((n) => (n.id === targetId ? { ...n, ...nextBox } : n)) : prev.nodes,
        texts: rKind === 'text' ? prev.texts.map((t) => (t.id === targetId ? { ...t, ...nextBox } : t)) : prev.texts,
      }));
      return;
    }

    if ((drag.kind === 'connect' || drag.kind === 'reconnect-edge') && draftEdge) {
      const excludeId = drag.kind === 'connect' ? drag.sourceId : drag.fixedEndpoint?.id;
      const excludeKind = drag.kind === 'connect' ? drag.sourceKind : drag.fixedEndpoint?.kind;
      const target = findEndpointAtPoint(world, excludeId, excludeKind);
      setDraftEdge((prev) =>
        prev
          ? {
              ...prev,
              currentWorld: world,
              hoverTargetId: target?.id,
              hoverTargetKind: target?.kind,
              hoverTargetAnchor: target ? pickClosestAnchor(target.box, world) : undefined,
            }
          : null
      );
    }
  };

  const finishDrag = (cancelled = false) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    try {
      if (drag.captureTarget.hasPointerCapture(drag.pointerId)) {
        drag.captureTarget.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // Ignore release errors
    }

    setMarqueeBox(null);

    if (cancelled) {
      if (drag.beforeSnapshot) onRevertTransient(drag.beforeSnapshot);
      setDraftEdge(null);
      return;
    }

    if (drag.kind === 'move') {
      if (drag.hasMoved && drag.beforeSnapshot) {
        onCommitDragMove(drag.beforeSnapshot, drag.pendingSelection ?? selection);
      } else if (drag.collapseSelectionOnClick) {
        onSelectionChange([drag.collapseSelectionOnClick]);
      }
      return;
    }

    if (drag.kind === 'resize' && drag.hasMoved && drag.beforeSnapshot) {
      onCommitDocument(drag.beforeSnapshot);
      return;
    }

    if (drag.kind === 'connect' && draftEdge) {
      if (
        draftEdge.hoverTargetId &&
        draftEdge.hoverTargetKind &&
        draftEdge.hoverTargetAnchor &&
        !(draftEdge.sourceKind === draftEdge.hoverTargetKind && draftEdge.sourceId === draftEdge.hoverTargetId)
      ) {
        onCreateEdge(
          draftEdge.sourceId,
          draftEdge.sourceKind,
          draftEdge.sourceAnchor,
          draftEdge.hoverTargetId,
          draftEdge.hoverTargetKind,
          draftEdge.hoverTargetAnchor
        );
      }
      setDraftEdge(null);
      return;
    }

    if (drag.kind === 'reconnect-edge' && draftEdge && drag.reconnectEdgeId && drag.reconnectEnd) {
      if (draftEdge.hoverTargetId && draftEdge.hoverTargetKind && draftEdge.hoverTargetAnchor) {
        onReconnectEdge(
          drag.reconnectEdgeId,
          drag.reconnectEnd,
          draftEdge.hoverTargetId,
          draftEdge.hoverTargetKind,
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
    if (e.currentTarget === e.target) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const payload = e.dataTransfer.getData('application/infrasketch-item');
    if (!payload) return;
    const world = clientToWorld(e.clientX, e.clientY);
    onDropCatalogItem(payload, world.x, world.y);
  };

  const handleContextMenu = (e: React.MouseEvent, itemKind?: 'node' | 'group' | 'edge' | 'text', itemId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (itemKind && itemId && !selectionHas(selection, itemKind, itemId)) {
      onSelectionChange([{ kind: itemKind, id: itemId }]);
    }
    const world = clientToWorld(e.clientX, e.clientY);
    onOpenContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      worldX: world.x,
      worldY: world.y,
    });
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

  const draftConnectorCoords = useMemo(() => {
    if (!draftEdge) return null;
    const srcBox = resolveEdgeEndpoint(doc, draftEdge.sourceId, draftEdge.sourceKind);
    if (!srcBox) return null;
    const start = getAnchorPoint(srcBox, draftEdge.sourceAnchor);
    let end = draftEdge.currentWorld;
    if (draftEdge.hoverTargetId && draftEdge.hoverTargetAnchor) {
      const tgt = resolveEdgeEndpoint(doc, draftEdge.hoverTargetId, draftEdge.hoverTargetKind);
      if (tgt) end = getAnchorPoint(tgt, draftEdge.hoverTargetAnchor);
    }
    return { start, end };
  }, [draftEdge, doc]);

  const isEmpty = doc.nodes.length === 0 && doc.groups.length === 0 && doc.texts.length === 0;
  const worldDotStep = viewport.zoom < 0.5 ? 40 : 20;
  const dotSpacing = worldDotStep * viewport.zoom;
  const canvasCursor =
    spacePressed || toolMode === 'pan'
      ? 'cursor-grab active:cursor-grabbing'
      : toolMode === 'connect' || toolMode === 'text'
        ? 'cursor-crosshair'
        : copyModifierPressed
          ? 'cursor-copy'
          : 'cursor-default';

  const singleSelection = selection.length === 1 ? selection[0] : null;

  return (
    <div
      ref={canvasContainerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPointerMove={handlePointerMove}
      onPointerUp={() => finishDrag(false)}
      onPointerCancel={() => finishDrag(true)}
      onContextMenu={(e) => handleContextMenu(e)}
      className={`relative flex-1 h-full overflow-hidden bg-[#fbfcfe] ${canvasCursor}`}
      style={{
        backgroundImage: 'radial-gradient(circle, #cbd5e1 1.15px, transparent 1.15px)',
        backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
        backgroundPosition: `${viewport.panX}px ${viewport.panY}px`,
      }}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/20 z-30 transition-opacity" />
      )}

      {/* Floating Top-Center Excalidraw-Style Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1.5 py-1.5 shadow-sm max-w-[calc(100%-2rem)] overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            onToolModeChange('select');
            setDraftEdge(null);
          }}
          title="Pilih, Marquee & Geser (V)"
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
          title="Hubungkan Komponen / Container dengan Panah (C)"
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
          onClick={() => {
            onToolModeChange(toolMode === 'text' ? 'select' : 'text');
            setDraftEdge(null);
          }}
          title="Tambah Catatan / Teks Bebas (T)"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            toolMode === 'text'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <StickyNote className="w-3.5 h-3.5" />
          <span>Teks</span>
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
          disabled={selection.length === 0}
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

        <button
          type="button"
          onClick={onOpenShortcutHelp}
          title="Daftar Pintasan Keyboard (?)"
          aria-label="Pintasan keyboard"
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {toolMode === 'connect' && (
        <div className="absolute top-[70px] left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-lg shadow-sm pointer-events-none whitespace-nowrap">
          {draftEdge
            ? 'Klik komponen atau container tujuan untuk menyelesaikan panah (Esc untuk batal)'
            : 'Klik komponen/container awal, lalu klik tujuan'}
        </div>
      )}

      {toolMode === 'text' && (
        <div className="absolute top-[70px] left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-lg shadow-sm pointer-events-none whitespace-nowrap">
          Klik di mana saja pada kanvas untuk menempatkan catatan (Esc untuk batal)
        </div>
      )}

      {/* Main SVG Sketch Viewport */}
      <svg className="w-full h-full block" onPointerDown={handleCanvasPointerDown}>
        <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
          {/* Layer 1: VPC / Subnet / Cluster Group Containers */}
          <g>
            {doc.groups.map((group) => {
              const isSelected = selectionHas(selection, 'group', group.id);
              const showResize =
                singleSelection?.kind === 'group' && singleSelection.id === group.id && !group.locked;
              const isConnectOrigin = draftEdge?.sourceKind === 'group' && draftEdge.sourceId === group.id;
              const showPorts =
                isSelected ||
                toolMode === 'connect' ||
                Boolean(draftEdge);

              return (
                <SketchGroupItem
                  key={group.id}
                  group={group}
                  isSelected={isSelected}
                  showResizeHandles={showResize}
                  isConnectOrigin={isConnectOrigin}
                  showPorts={showPorts}
                  onPointerDown={(e, g) => startMovableItemPointerDown(e, 'group', g)}
                  onDoubleClick={(e, g) => {
                    e.stopPropagation();
                    setInlineEdit({
                      kind: 'group',
                      id: g.id,
                      value: g.label,
                      worldX: g.x + 10,
                      worldY: g.y - 30,
                      width: 220,
                    });
                  }}
                  onContextMenu={handleContextMenu}
                  onResizeStart={(e, g, corner) => handleResizeStart(e, 'group', g, corner)}
                  onPortPointerDown={handlePortPointerDown}
                  onHoverChange={setHoveredKey}
                />
              );
            })}
          </g>

          {/* Layer 2: Labeled Connector Edges */}
          <g>
            {doc.edges.map((edge) => {
              const srcBox = resolveEdgeEndpoint(doc, edge.sourceId, edge.sourceKind);
              const tgtBox = resolveEdgeEndpoint(doc, edge.targetId, edge.targetKind);
              if (!srcBox || !tgtBox) return null;
              const isSelected = selectionHas(selection, 'edge', edge.id);
              const showReconnect =
                singleSelection?.kind === 'edge' && singleSelection.id === edge.id;
              return (
                <SketchEdgeItem
                  key={edge.id}
                  edge={edge}
                  sourceBox={srcBox}
                  targetBox={tgtBox}
                  isSelected={isSelected}
                  showReconnectHandles={showReconnect}
                  onSelect={handleEdgePointerDown}
                  onDoubleClick={(e, ed, midpoint) => {
                    e.stopPropagation();
                    setInlineEdit({
                      kind: 'edge',
                      id: ed.id,
                      value: ed.label,
                      worldX: midpoint.x - 70,
                      worldY: midpoint.y - 14,
                      width: 140,
                    });
                  }}
                  onContextMenu={handleContextMenu}
                  onReconnectStart={handleReconnectStart}
                />
              );
            })}
          </g>

          {/* Layer 3: Cloud Service Nodes */}
          <g>
            {doc.nodes.map((node) => {
              const isSelected = selectionHas(selection, 'node', node.id);
              const showResize =
                singleSelection?.kind === 'node' && singleSelection.id === node.id && !node.locked;
              const isConnectOrigin = draftEdge?.sourceKind === 'node' && draftEdge.sourceId === node.id;
              const showPorts =
                isSelected ||
                hoveredKey === `node:${node.id}` ||
                toolMode === 'connect' ||
                Boolean(draftEdge);

              return (
                <SketchNodeItem
                  key={node.id}
                  node={node}
                  isSelected={isSelected}
                  showResizeHandles={showResize}
                  isConnectOrigin={isConnectOrigin}
                  showPorts={showPorts}
                  onPointerDown={(e, n) => startMovableItemPointerDown(e, 'node', n)}
                  onDoubleClick={(e, n) => {
                    e.stopPropagation();
                    setInlineEdit({
                      kind: 'node',
                      id: n.id,
                      value: n.label,
                      worldX: n.x + 54,
                      worldY: n.y + n.height / 2 - 14,
                      width: n.width - 62,
                    });
                  }}
                  onContextMenu={handleContextMenu}
                  onResizeStart={(e, n, corner) => handleResizeStart(e, 'node', n, corner)}
                  onPortPointerDown={handlePortPointerDown}
                  onHoverChange={setHoveredKey}
                />
              );
            })}
          </g>

          {/* Layer 4: Sticky Notes & Free Text Annotations */}
          <g>
            {doc.texts.map((item) => {
              const isSelected = selectionHas(selection, 'text', item.id);
              const showResize =
                singleSelection?.kind === 'text' && singleSelection.id === item.id && !item.locked;
              return (
                <SketchTextItem
                  key={item.id}
                  item={item}
                  isSelected={isSelected}
                  showResizeHandles={showResize}
                  onPointerDown={(e, t) => startMovableItemPointerDown(e, 'text', t)}
                  onDoubleClick={(e, t) => {
                    e.stopPropagation();
                    setInlineEdit({
                      kind: 'text',
                      id: t.id,
                      value: t.text,
                      worldX: t.x + 6,
                      worldY: t.y + 6,
                      width: t.width - 12,
                      height: t.height - 12,
                      multiline: true,
                    });
                  }}
                  onContextMenu={handleContextMenu}
                  onResizeStart={(e, t, corner) => handleResizeStart(e, 'text', t, corner)}
                />
              );
            })}
          </g>

          {/* Layer 5: Live Draft Connector Line */}
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
              <circle cx={draftConnectorCoords.end.x} cy={draftConnectorCoords.end.y} r={5} fill="#4f46e5" />
            </g>
          )}

          {/* Layer 6: Marquee Selection Rectangle */}
          {marqueeBox && (
            <rect
              x={marqueeBox.x}
              y={marqueeBox.y}
              width={marqueeBox.width}
              height={marqueeBox.height}
              fill="rgba(79, 70, 229, 0.08)"
              stroke="#4f46e5"
              strokeWidth={1.2 / viewport.zoom}
              strokeDasharray={`${5 / viewport.zoom} ${3 / viewport.zoom}`}
              className="pointer-events-none"
            />
          )}
        </g>
      </svg>

      {/* Inline Label / Text Editor Overlay */}
      {inlineEdit &&
        (inlineEdit.multiline ? (
          <textarea
            autoFocus
            value={inlineEdit.value}
            onChange={(e) => setInlineEdit((prev) => (prev ? { ...prev, value: e.target.value } : null))}
            onBlur={commitInlineEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitInlineEdit();
              }
              if (e.key === 'Escape') setInlineEdit(null);
            }}
            style={{
              left: inlineEdit.worldX * viewport.zoom + viewport.panX,
              top: inlineEdit.worldY * viewport.zoom + viewport.panY,
              width: Math.max(140, inlineEdit.width * viewport.zoom),
              height: Math.max(54, (inlineEdit.height ?? 60) * viewport.zoom),
              fontFamily: 'var(--font-sketch)',
            }}
            className="absolute z-40 px-2 py-1.5 text-sm bg-white text-slate-900 border-2 border-indigo-500 rounded-md shadow-md outline-none resize-none"
          />
        ) : (
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
        ))}

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
          title="Perkecil (Ctrl+-)"
          aria-label="Perkecil kanvas"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={resetZoom100}
          title="Reset zoom ke 100% (Ctrl+0)"
          className="px-2 py-1 text-xs font-mono tabular-nums text-slate-700 hover:bg-slate-100 rounded-md min-w-[50px] text-center cursor-pointer"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>

        <button
          type="button"
          onClick={() => adjustZoom(0.15)}
          title="Perbesar (Ctrl+=)"
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
        <span>Double-klik edit teks</span>
        <span aria-hidden="true">·</span>
        <span>Ctrl+Drag duplikat</span>
        <span aria-hidden="true">·</span>
        <span>? pintasan</span>
      </div>
    </div>
  );
}
