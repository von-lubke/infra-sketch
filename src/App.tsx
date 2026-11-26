import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from './components/Canvas';
import { CatalogSidebar } from './components/CatalogSidebar';
import { ExportPngModal } from './components/ExportPngModal';
import { Header } from './components/Header';
import { InspectorPanel } from './components/InspectorPanel';
import {
  CATALOG_COMPONENTS,
  CATALOG_GROUPS,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
} from './data/catalog';
import { ARCHITECTURE_TEMPLATES, ArchitectureTemplate } from './data/templates';
import {
  AnchorSide,
  CatalogComponent,
  CatalogGroup,
  DiagramDocument,
  InfraEdge,
  InfraGroup,
  InfraNode,
  Selection,
  ToolMode,
  Viewport,
} from './types/diagram';
import {
  exportDiagramToJson,
  parseAndValidateDiagramJson,
} from './utils/exportImport';
import {
  computeDiagramBounds,
  generateId,
  randomSeed,
  snapValue,
} from './utils/geometry';

const STORAGE_KEY = 'infrasketch:document:v1';
const MAX_HISTORY = 40;

interface ToastMessage {
  id: number;
  text: string;
  tone: 'neutral' | 'error';
}

function loadInitialDocument(): DiagramDocument {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = parseAndValidateDiagramJson(saved);
      if (parsed.ok) return parsed.doc;
    }
  } catch {
    // Fallback to default starter template if storage unavailable
  }
  return ARCHITECTURE_TEMPLATES[0].build();
}

export default function App() {
  const [doc, setDoc] = useState<DiagramDocument>(() => loadInitialDocument());
  const [past, setPast] = useState<DiagramDocument[]>([]);
  const [future, setFuture] = useState<DiagramDocument[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [viewport, setViewport] = useState<Viewport>({ panX: 40, panY: 40, zoom: 0.92 });
  const [exportPngOpen, setExportPngOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((text: string, tone: 'neutral' | 'error' = 'neutral') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  }, []);

  // Persist current diagram safely to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      // Ignore storage quota errors silently
    }
  }, [doc]);

  // Fit diagram cleanly into visible canvas container
  const fitToView = useCallback((targetDoc: DiagramDocument) => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const bounds = computeDiagramBounds(targetDoc);

    if (!bounds || rect.width === 0 || rect.height === 0) {
      setViewport({ panX: 60, panY: 60, zoom: 1 });
      return;
    }

    const padX = 90;
    const padY = 100;
    const scaleX = (rect.width - padX * 2) / bounds.width;
    const scaleY = (rect.height - padY * 2) / bounds.height;
    const nextZoom = Math.min(1.15, Math.max(0.45, Number(Math.min(scaleX, scaleY).toFixed(2))));

    const centerX = bounds.minX + bounds.width / 2;
    const centerY = bounds.minY + bounds.height / 2;

    setViewport({
      zoom: nextZoom,
      panX: Math.round(rect.width / 2 - centerX * nextZoom),
      panY: Math.round(rect.height / 2 - centerY * nextZoom),
    });
  }, []);

  // Run initial Fit-to-View once mounted
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      fitToView(doc);
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // History-aware document mutation
  const updateDocument = useCallback((updater: (prev: DiagramDocument) => DiagramDocument) => {
    setDoc((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      setPast((h) => [...h.slice(-(MAX_HISTORY - 1)), prev]);
      setFuture([]);
      return { ...next, updatedAt: new Date().toISOString() };
    });
  }, []);

  const commitBeforeSnapshot = useCallback((beforeSnapshot: DiagramDocument) => {
    setPast((h) => [...h.slice(-(MAX_HISTORY - 1)), beforeSnapshot]);
    setFuture([]);
  }, []);

  const handleUndo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const previousDoc = prevPast[prevPast.length - 1];
      setDoc((currentDoc) => {
        setFuture((f) => [currentDoc, ...f.slice(0, MAX_HISTORY - 1)]);
        return previousDoc;
      });
      setSelection(null);
      return prevPast.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const nextDoc = prevFuture[0];
      setDoc((currentDoc) => {
        setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), currentDoc]);
        return nextDoc;
      });
      setSelection(null);
      return prevFuture.slice(1);
    });
  }, []);

  const getViewportCenterWorld = useCallback(() => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 900;
    const h = rect?.height ?? 600;
    return {
      x: (w / 2 - viewport.panX) / viewport.zoom,
      y: (h / 2 - viewport.panY) / viewport.zoom,
    };
  }, [viewport]);

  const addNodeAt = useCallback(
    (component: CatalogComponent, worldX: number, worldY: number) => {
      const id = generateId('node');
      const newNode: InfraNode = {
        id,
        type: component.id,
        provider: component.provider,
        label: component.label,
        sublabel: component.defaultSublabel,
        iconKey: component.iconKey,
        x: snapValue(worldX - DEFAULT_NODE_WIDTH / 2, snapToGrid),
        y: snapValue(worldY - DEFAULT_NODE_HEIGHT / 2, snapToGrid),
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        colorTheme: component.colorTheme,
        seed: randomSeed(),
      };
      updateDocument((prev) => ({
        ...prev,
        nodes: [...prev.nodes, newNode],
      }));
      setSelection({ kind: 'node', id });
      setToolMode('select');
    },
    [snapToGrid, updateDocument]
  );

  const addGroupAt = useCallback(
    (groupDef: CatalogGroup, worldX: number, worldY: number) => {
      const id = generateId('grp');
      const newGroup: InfraGroup = {
        id,
        kind: groupDef.kind,
        label: groupDef.label,
        meta: groupDef.defaultMeta,
        x: snapValue(worldX - groupDef.defaultWidth / 2, snapToGrid),
        y: snapValue(worldY - groupDef.defaultHeight / 2, snapToGrid),
        width: groupDef.defaultWidth,
        height: groupDef.defaultHeight,
        colorTheme: groupDef.colorTheme,
        seed: randomSeed(),
      };
      updateDocument((prev) => ({
        ...prev,
        groups: [...prev.groups, newGroup],
      }));
      setSelection({ kind: 'group', id });
      setToolMode('select');
    },
    [snapToGrid, updateDocument]
  );

  const handleQuickAddNode = useCallback(
    (component: CatalogComponent) => {
      const center = getViewportCenterWorld();
      const jitter = ((doc.nodes.length % 5) - 2) * 24;
      addNodeAt(component, center.x + jitter, center.y + jitter);
    },
    [addNodeAt, doc.nodes.length, getViewportCenterWorld]
  );

  const handleQuickAddGroup = useCallback(
    (groupDef: CatalogGroup) => {
      const center = getViewportCenterWorld();
      const jitter = ((doc.groups.length % 4) - 1) * 28;
      addGroupAt(groupDef, center.x + jitter, center.y + jitter);
    },
    [addGroupAt, doc.groups.length, getViewportCenterWorld]
  );

  const handleDropCatalogItem = useCallback(
    (rawPayload: string, worldX: number, worldY: number) => {
      try {
        const parsed = JSON.parse(rawPayload) as { itemKind: 'node'; id: string } | { itemKind: 'group'; kind: string };
        if (parsed.itemKind === 'node') {
          const comp = CATALOG_COMPONENTS.find((c) => c.id === parsed.id);
          if (comp) addNodeAt(comp, worldX, worldY);
        } else if (parsed.itemKind === 'group') {
          const grp = CATALOG_GROUPS.find((g) => g.kind === parsed.kind);
          if (grp) addGroupAt(grp, worldX, worldY);
        }
      } catch {
        // Ignore malformed drag data
      }
    },
    [addGroupAt, addNodeAt]
  );

  const handleCreateEdge = useCallback(
    (sourceId: string, sourceAnchor: AnchorSide, targetId: string, targetAnchor: AnchorSide) => {
      if (sourceId === targetId) return;
      const id = generateId('edge');
      const newEdge: InfraEdge = {
        id,
        sourceId,
        sourceAnchor,
        targetId,
        targetAnchor,
        label: 'HTTPS',
        lineStyle: 'solid',
        curveType: 'curved',
        bidirectional: false,
        colorTheme: 'slate',
        seed: randomSeed(),
      };
      updateDocument((prev) => ({
        ...prev,
        edges: [...prev.edges, newEdge],
      }));
      setSelection({ kind: 'edge', id });
    },
    [updateDocument]
  );

  const handleTransientUpdateNode = useCallback((id: string, patch: Partial<InfraNode>) => {
    setDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  }, []);

  const handleTransientUpdateGroup = useCallback((id: string, patch: Partial<InfraGroup>) => {
    setDoc((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  }, []);

  const handleUpdateNode = useCallback(
    (id: string, patch: Partial<InfraNode>) => {
      updateDocument((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      }));
    },
    [updateDocument]
  );

  const handleUpdateGroup = useCallback(
    (id: string, patch: Partial<InfraGroup>) => {
      updateDocument((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      }));
    },
    [updateDocument]
  );

  const handleUpdateEdge = useCallback(
    (id: string, patch: Partial<InfraEdge>) => {
      updateDocument((prev) => ({
        ...prev,
        edges: prev.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }));
    },
    [updateDocument]
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selection) return;
    updateDocument((prev) => {
      if (selection.kind === 'node') {
        return {
          ...prev,
          nodes: prev.nodes.filter((n) => n.id !== selection.id),
          edges: prev.edges.filter((e) => e.sourceId !== selection.id && e.targetId !== selection.id),
        };
      }
      if (selection.kind === 'group') {
        return {
          ...prev,
          groups: prev.groups.filter((g) => g.id !== selection.id),
        };
      }
      return {
        ...prev,
        edges: prev.edges.filter((e) => e.id !== selection.id),
      };
    });
    setSelection(null);
  }, [selection, updateDocument]);

  const handleDuplicateSelected = useCallback(() => {
    if (!selection) return;
    if (selection.kind === 'node') {
      const target = doc.nodes.find((n) => n.id === selection.id);
      if (!target) return;
      const id = generateId('node');
      const copy: InfraNode = {
        ...target,
        id,
        x: target.x + 28,
        y: target.y + 28,
        seed: randomSeed(),
      };
      updateDocument((prev) => ({ ...prev, nodes: [...prev.nodes, copy] }));
      setSelection({ kind: 'node', id });
    } else if (selection.kind === 'group') {
      const target = doc.groups.find((g) => g.id === selection.id);
      if (!target) return;
      const id = generateId('grp');
      const copy: InfraGroup = {
        ...target,
        id,
        x: target.x + 32,
        y: target.y + 32,
        seed: randomSeed(),
      };
      updateDocument((prev) => ({ ...prev, groups: [...prev.groups, copy] }));
      setSelection({ kind: 'group', id });
    }
  }, [doc.groups, doc.nodes, selection, updateDocument]);

  const handleSelectTemplate = useCallback(
    (template: ArchitectureTemplate) => {
      const nextDoc = template.build();
      updateDocument(() => nextDoc);
      setSelection(null);
      setToolMode('select');
      window.requestAnimationFrame(() => fitToView(nextDoc));
      showToast(`Template "${template.name}" dimuat.`);
    },
    [fitToView, showToast, updateDocument]
  );

  const handleLoadStarterTemplateById = useCallback(
    (templateId: string) => {
      const tpl = ARCHITECTURE_TEMPLATES.find((t) => t.id === templateId);
      if (tpl) handleSelectTemplate(tpl);
    },
    [handleSelectTemplate]
  );

  const handleClearCanvas = useCallback(() => {
    updateDocument((prev) => ({
      ...prev,
      groups: [],
      nodes: [],
      edges: [],
    }));
    setSelection(null);
    showToast('Kanvas dibersihkan. Gunakan Ctrl+Z untuk membatalkan.');
  }, [showToast, updateDocument]);

  const handleExportJson = useCallback(() => {
    exportDiagramToJson(doc);
    showToast('File JSON berhasil diunduh.');
  }, [doc, showToast]);

  const handleImportJsonFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const result = parseAndValidateDiagramJson(text);
        if (!result.ok) {
          showToast(result.error, 'error');
          return;
        }
        updateDocument(() => result.doc);
        setSelection(null);
        setToolMode('select');
        window.requestAnimationFrame(() => fitToView(result.doc));
        showToast(`Diagram "${result.doc.title}" berhasil diimpor.`);
      };
      reader.onerror = () => {
        showToast('Gagal membaca file JSON.', 'error');
      };
      reader.readAsText(file);
    },
    [fitToView, showToast, updateDocument]
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditing) return;

      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'v') setToolMode('select');
      else if (key === 'h') setToolMode('pan');
      else if (key === 'c') setToolMode('connect');
      else if (key === 'g') handleQuickAddGroup(CATALOG_GROUPS[0]);
      else if (e.key === 'Escape') {
        setSelection(null);
        setToolMode('select');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDeleteSelected, handleDuplicateSelected, handleQuickAddGroup, handleRedo, handleUndo, selection]);

  const selectedNode = useMemo(
    () => (selection?.kind === 'node' ? doc.nodes.find((n) => n.id === selection.id) ?? null : null),
    [doc.nodes, selection]
  );

  const selectedGroup = useMemo(
    () => (selection?.kind === 'group' ? doc.groups.find((g) => g.id === selection.id) ?? null : null),
    [doc.groups, selection]
  );

  const selectedEdge = useMemo(
    () => (selection?.kind === 'edge' ? doc.edges.find((e) => e.id === selection.id) ?? null : null),
    [doc.edges, selection]
  );

  const hasElements = doc.nodes.length > 0 || doc.groups.length > 0;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 text-slate-900">
      {/* Top 3-Zone Header */}
      <Header
        title={doc.title}
        onTitleChange={(title) => updateDocument((prev) => ({ ...prev, title }))}
        onSelectTemplate={handleSelectTemplate}
        onImportJsonFile={handleImportJsonFile}
        onExportJson={handleExportJson}
        onOpenExportPng={() => setExportPngOpen(true)}
        hasElements={hasElements}
      />

      {/* Main Workspace: Catalog Sidebar + Sketch Canvas + Contextual Inspector */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <CatalogSidebar
          onQuickAddNode={handleQuickAddNode}
          onQuickAddGroup={handleQuickAddGroup}
        />

        <Canvas
          doc={doc}
          viewport={viewport}
          onViewportChange={setViewport}
          toolMode={toolMode}
          onToolModeChange={setToolMode}
          selection={selection}
          onSelectionChange={setSelection}
          snapToGrid={snapToGrid}
          onToggleSnapToGrid={() => setSnapToGrid((v) => !v)}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onQuickAddVpc={() => handleQuickAddGroup(CATALOG_GROUPS[0])}
          onDropCatalogItem={handleDropCatalogItem}
          onTransientUpdateNode={handleTransientUpdateNode}
          onTransientUpdateGroup={handleTransientUpdateGroup}
          onCommitDocument={commitBeforeSnapshot}
          onUpdateNodeLabel={(id, label) => handleUpdateNode(id, { label })}
          onUpdateGroupLabel={(id, label) => handleUpdateGroup(id, { label })}
          onUpdateEdgeLabel={(id, label) => handleUpdateEdge(id, { label })}
          onCreateEdge={handleCreateEdge}
          onDeleteSelected={handleDeleteSelected}
          onClearCanvas={handleClearCanvas}
          onFitToView={() => fitToView(doc)}
          onLoadStarterTemplate={handleLoadStarterTemplateById}
          canvasContainerRef={canvasContainerRef}
        />

        <InspectorPanel
          selectedNode={selectedNode}
          selectedGroup={selectedGroup}
          selectedEdge={selectedEdge}
          onUpdateNode={handleUpdateNode}
          onUpdateGroup={handleUpdateGroup}
          onUpdateEdge={handleUpdateEdge}
          onDuplicateSelected={handleDuplicateSelected}
          onDeleteSelected={handleDeleteSelected}
          onClose={() => setSelection(null)}
        />
      </div>

      {/* Export PNG Dialog */}
      <ExportPngModal
        open={exportPngOpen}
        doc={doc}
        onClose={() => setExportPngOpen(false)}
        onExportSuccess={() => showToast('Gambar PNG berhasil diunduh.')}
      />

      {/* Subtle Toast Notification */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg border transition-opacity ${
            toast.tone === 'error'
              ? 'bg-rose-600 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
