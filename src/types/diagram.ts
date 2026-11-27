export type Provider = 'generic' | 'aws' | 'gcp' | 'azure' | 'k8s';

export type ColorTheme = 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';

export type GroupKind = 'vpc' | 'subnet-public' | 'subnet-private' | 'cluster';

export type ToolMode = 'select' | 'pan' | 'connect' | 'text';

export type EdgeRouting = 'curved' | 'straight' | 'orthogonal';

export type ArrowHeadMode = 'end' | 'both' | 'none';

export type EndpointKind = 'node' | 'group';

export interface ThemeStyle {
  id: ColorTheme;
  label: string;
  fill: string;
  stroke: string;
  iconBg: string;
  iconColor: string;
  groupFill: string;
  groupStroke: string;
}

export interface CatalogComponent {
  id: string;
  label: string;
  defaultSublabel: string;
  provider: Provider;
  category: 'compute' | 'network' | 'storage' | 'data' | 'security';
  colorTheme: ColorTheme;
  iconKey: string;
}

export interface CatalogGroup {
  kind: GroupKind;
  label: string;
  defaultMeta: string;
  colorTheme: ColorTheme;
  defaultWidth: number;
  defaultHeight: number;
}

export interface InfraNode {
  id: string;
  type: string;
  provider: Provider;
  label: string;
  sublabel: string;
  iconKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colorTheme: ColorTheme;
  seed: number;
  parentId?: string;
  locked?: boolean;
}

export interface InfraGroup {
  id: string;
  kind: GroupKind;
  label: string;
  meta: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colorTheme: ColorTheme;
  seed: number;
  parentId?: string;
  locked?: boolean;
}

export interface InfraText {
  id: string;
  text: string;
  variant: 'note' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  colorTheme: ColorTheme;
  seed: number;
  parentId?: string;
  locked?: boolean;
}

export interface InfraEdge {
  id: string;
  sourceId: string;
  sourceKind?: EndpointKind;
  sourceAnchor: AnchorSide;
  targetId: string;
  targetKind?: EndpointKind;
  targetAnchor: AnchorSide;
  label: string;
  lineStyle: 'solid' | 'dashed';
  routing: EdgeRouting;
  arrowHead: ArrowHeadMode;
  colorTheme: ColorTheme;
  seed: number;
  /** Legacy v1 fields accepted on import */
  curveType?: 'curved' | 'straight';
  bidirectional?: boolean;
}

export interface DiagramDocument {
  version: number;
  title: string;
  updatedAt: string;
  groups: InfraGroup[];
  nodes: InfraNode[];
  texts: InfraText[];
  edges: InfraEdge[];
}

export type SelectionKind = 'node' | 'group' | 'edge' | 'text';

export interface SelectionItem {
  kind: SelectionKind;
  id: string;
}

export type Selection = SelectionItem[];

export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface CopiedStyle {
  colorTheme: ColorTheme;
  width?: number;
  height?: number;
  lineStyle?: 'solid' | 'dashed';
  routing?: EdgeRouting;
  arrowHead?: ArrowHeadMode;
  variant?: 'note' | 'text';
}

export interface ExportOptions {
  format: 'png' | 'svg';
  background: 'white' | 'transparent';
  scale: 1 | 2 | 3;
  padding: number;
  selectionOnly: boolean;
}
