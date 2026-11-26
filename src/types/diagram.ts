export type Provider = 'generic' | 'aws' | 'gcp' | 'k8s';

export type ColorTheme = 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';

export type GroupKind = 'vpc' | 'subnet-public' | 'subnet-private' | 'cluster';

export type ToolMode = 'select' | 'pan' | 'connect';

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
}

export interface InfraEdge {
  id: string;
  sourceId: string;
  sourceAnchor: AnchorSide;
  targetId: string;
  targetAnchor: AnchorSide;
  label: string;
  lineStyle: 'solid' | 'dashed';
  curveType: 'curved' | 'straight';
  bidirectional: boolean;
  colorTheme: ColorTheme;
  seed: number;
}

export interface DiagramDocument {
  version: number;
  title: string;
  updatedAt: string;
  groups: InfraGroup[];
  nodes: InfraNode[];
  edges: InfraEdge[];
}

export type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'edge'; id: string }
  | null;

export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface PngExportOptions {
  background: 'white' | 'transparent';
  scale: 1 | 2 | 3;
  padding: number;
}
