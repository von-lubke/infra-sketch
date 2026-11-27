import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from './components/Canvas';
import { CatalogSidebar } from './components/CatalogSidebar';
import { ContextMenu, ContextMenuState } from './components/ContextMenu';
import { ExportModal } from './components/ExportModal';
import { Header } from './components/Header';
import { InspectorPanel } from './components/InspectorPanel';
import { ShortcutHelpModal } from './components/ShortcutHelpModal';
import {
  CATALOG_COMPONENTS,
  CATALOG_GROUPS,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  DEFAULT_TEXT_HEIGHT,
  DEFAULT_TEXT_WIDTH,
  GRID_SIZE,
} from './data/catalog';
import { ARCHITECTURE_TEMPLATES, ArchitectureTemplate } from './data/templates';
import { useHistory } from './hooks/useHistory';
import {
  AnchorSide,
  CatalogComponent,
  CatalogGroup,
  ColorTheme,
  CopiedStyle,
  DiagramDocument,
  EndpointKind,
  InfraEdge,
  InfraGroup,
  InfraNode,
  InfraText,
  Selection,
  ToolMode,
  Viewport,
} from './types/diagram';
import {
  applyCopiedStyle,
  buildClipboardEnvelope,
  ClipboardEnvelope,
  cloneElements,
  deleteSelection,
  extractCopiedStyle,
  nudgeSelection,
  parseClipboardEnvelope,
  pasteClipboardEnvelope,
  reconcileContainment,
  reorderSelection,
  selectionHas,
} from './utils/diagramOps';
import { exportDiagramToJson, parseAndValidateDiagramJson } from './utils/exportImport';
import {
  computeDiagramBounds,
  findSmallestContainingGroup,
  generateId,
  randomSeed,
  snapValue,
} from './utils/geometry';

const STORAGE_KEY = 'infrasketch:document:v1';
const CLIPBOARD_STORAGE_KEY = 'infrasketch:clipboard:v1';

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
  const {
    doc,
    canUndo,
    canRedo,
    setDocument,
    setTransient,
    commitBefore,
    revertTransient,
    undo,
    redo,
  } = useHistory(loadInitialDocument);

  const [selection, setSelection] = useState<Selection>([]);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [viewport, setViewport] = useState<Viewport>({ panX: 40, panY: 40, zoom: 0.92 });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [copiedStyle, setCopiedStyle] = useState<CopiedStyle | null>(null);
  const [clipboardFallback, setClipboardFallback] = useState<ClipboardEnvelope | null>(() => {
    try {
      const saved = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
      return saved ? parseClipboardEnvelope(saved) : null;
    } catch {
      return null;
    }
  });
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const clipboardRef = useRef<ClipboardEnvelope | null>(clipboardFallback);
  const latestDocRef = useRef(doc);

  useEffect(() => {
    latestDocRef.current = doc;
  }, [doc]);

  const showToast = useCallback((text: string, tone: 'neutral' | 'error' = 'neutral') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  }, []);

  // Debounced auto-save to localStorage + flush on page unload
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
      } catch {
        // Ignore storage quota errors silently
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [doc]);

  useEffect(() => {
    const flushSave = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(latestDocRef.current));
      } catch {
        // Ignore
      }
    };
    window.addEventListener('beforeunload', flushSave);
    return () => window.removeEventListener('beforeunload', flushSave);
  }, []);

  // Reveal scrollbars briefly while any container is actively scrolling
  useEffect(() => {
    const timers = new WeakMap<HTMLElement, number>();
    const onScroll = (e: Event) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      target.classList.add('is-scrolling');
      const prevTimer = timers.get(target);
      if (prevTimer) window.clearTimeout(prevTimer);
      const nextTimer = window.setTimeout(() => {
        target.classList.remove('is-scrolling');
        timers.delete(target);
      }, 900);
      timers.set(target, nextTimer);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

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

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      fitToView(latestDocRef.current);
    });
    return () => window.cancelAnimationFrame(id);
  }, [fitToView]);

  const handleUndo = useCallback(() => {
    undo();
    setSelection([]);
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
    setSelection([]);
  }, [redo]);

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
      const x = snapValue(worldX - DEFAULT_NODE_WIDTH / 2, snapToGrid);
      const y = snapValue(worldY - DEFAULT_NODE_HEIGHT / 2, snapToGrid);
      setDocument((prev) => {
        const parent = findSmallestContainingGroup(prev.groups, {
          x,
          y,
          width: DEFAULT_NODE_WIDTH,
          height: DEFAULT_NODE_HEIGHT,
        });
        const newNode: InfraNode = {
          id,
          type: component.id,
          provider: component.provider,
          label: component.label,
          sublabel: component.defaultSublabel,
          iconKey: component.iconKey,
          x,
          y,
          width: DEFAULT_NODE_WIDTH,
          height: DEFAULT_NODE_HEIGHT,
          colorTheme: component.colorTheme,
          seed: randomSeed(),
          parentId: parent?.id,
        };
        return { ...prev, nodes: [...prev.nodes, newNode] };
      });
      setSelection([{ kind: 'node', id }]);
      setToolMode('select');
    },
    [setDocument, snapToGrid]
  );

  const addGroupAt = useCallback(
    (groupDef: CatalogGroup, worldX: number, worldY: number) => {
      const id = generateId('grp');
      const x = snapValue(worldX - groupDef.defaultWidth / 2, snapToGrid);
      const y = snapValue(worldY - groupDef.defaultHeight / 2, snapToGrid);
      setDocument((prev) => {
        const candidates = prev.groups.filter(
          (g) => g.width * g.height > groupDef.defaultWidth * groupDef.defaultHeight
        );
        const parent = findSmallestContainingGroup(candidates, {
          x,
          y,
          width: groupDef.defaultWidth,
          height: groupDef.defaultHeight,
        });
        const newGroup: InfraGroup = {
          id,
          kind: groupDef.kind,
          label: groupDef.label,
          meta: groupDef.defaultMeta,
          x,
          y,
          width: groupDef.defaultWidth,
          height: groupDef.defaultHeight,
          colorTheme: groupDef.colorTheme,
          seed: randomSeed(),
          parentId: parent?.id,
        };
        return { ...prev, groups: [...prev.groups, newGroup] };
      });
      setSelection([{ kind: 'group', id }]);
      setToolMode('select');
    },
    [setDocument, snapToGrid]
  );

  const addTextAt = useCallback(
    (worldX: number, worldY: number, variant: 'note' | 'text' = 'note'): string => {
      const id = generateId('txt');
      const x = snapValue(worldX - DEFAULT_TEXT_WIDTH / 2, snapToGrid);
      const y = snapValue(worldY - DEFAULT_TEXT_HEIGHT / 2, snapToGrid);
      setDocument((prev) => {
        const parent = findSmallestContainingGroup(prev.groups, {
          x,
          y,
          width: DEFAULT_TEXT_WIDTH,
          height: DEFAULT_TEXT_HEIGHT,
        });
        const newText: InfraText = {
          id,
          text: variant === 'note' ? 'Catatan baru' : 'Teks anotasi',
          variant,
          x,
          y,
          width: DEFAULT_TEXT_WIDTH,
          height: DEFAULT_TEXT_HEIGHT,
          colorTheme: variant === 'note' ? 'amber' : 'slate',
          seed: randomSeed(),
          parentId: parent?.id,
        };
        return { ...prev, texts: [...prev.texts, newText] };
      });
      setSelection([{ kind: 'text', id }]);
      setToolMode('select');
      return id;
    },
    [setDocument, snapToGrid]
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

  const handleQuickAddText = useCallback(
    (variant: 'note' | 'text') => {
      const center = getViewportCenterWorld();
      const jitter = ((doc.texts.length % 4) - 1) * 24;
      addTextAt(center.x + jitter, center.y + jitter, variant);
    },
    [addTextAt, doc.texts.length, getViewportCenterWorld]
  );

  const handleDropCatalogItem = useCallback(
    (rawPayload: string, worldX: number, worldY: number) => {
      try {
        const parsed = JSON.parse(rawPayload) as
          | { itemKind: 'node'; id: string }
          | { itemKind: 'group'; kind: string }
          | { itemKind: 'text'; variant: 'note' | 'text' };
        if (parsed.itemKind === 'node') {
          const comp = CATALOG_COMPONENTS.find((c) => c.id === parsed.id);
          if (comp) addNodeAt(comp, worldX, worldY);
        } else if (parsed.itemKind === 'group') {
          const grp = CATALOG_GROUPS.find((g) => g.kind === parsed.kind);
          if (grp) addGroupAt(grp, worldX, worldY);
        } else if (parsed.itemKind === 'text') {
          addTextAt(worldX, worldY, parsed.variant === 'text' ? 'text' : 'note');
        }
      } catch {
        // Ignore malformed drag data
      }
    },
    [addGroupAt, addNodeAt, addTextAt]
  );

  const handleCreateEdge = useCallback(
    (
      sourceId: string,
      sourceKind: EndpointKind,
      sourceAnchor: AnchorSide,
      targetId: string,
      targetKind: EndpointKind,
      targetAnchor: AnchorSide
    ) => {
      if (sourceKind === targetKind && sourceId === targetId) return;
      const id = generateId('edge');
      const newEdge: InfraEdge = {
        id,
        sourceId,
        sourceKind,
        sourceAnchor,
        targetId,
        targetKind,
        targetAnchor,
        label: '',
        lineStyle: 'solid',
        routing: 'curved',
        arrowHead: 'end',
        colorTheme: 'slate',
        seed: randomSeed(),
      };
      setDocument((prev) => ({
        ...prev,
        edges: [...prev.edges, newEdge],
      }));
      setSelection([{ kind: 'edge', id }]);
    },
    [setDocument]
  );

  const handleReconnectEdge = useCallback(
    (
      edgeId: string,
      end: 'source' | 'target',
      endpointId: string,
      endpointKind: EndpointKind,
      anchor: AnchorSide
    ) => {
      setDocument((prev) => ({
        ...prev,
        edges: prev.edges.map((e) => {
          if (e.id !== edgeId) return e;
          if (end === 'source') {
            if ((e.targetKind ?? 'node') === endpointKind && e.targetId === endpointId) return e;
            return { ...e, sourceId: endpointId, sourceKind: endpointKind, sourceAnchor: anchor };
          }
          if ((e.sourceKind ?? 'node') === endpointKind && e.sourceId === endpointId) return e;
          return { ...e, targetId: endpointId, targetKind: endpointKind, targetAnchor: anchor };
        }),
      }));
    },
    [setDocument]
  );

  const handleCommitDragMove = useCallback(
    (beforeSnapshot: DiagramDocument, movedSelection: Selection) => {
      setTransient((prev) => reconcileContainment(prev, movedSelection));
      commitBefore(beforeSnapshot);
    },
    [commitBefore, setTransient]
  );

  const handleDuplicateForDrag = useCallback(
    (baseDoc: DiagramDocument, targetSelection: Selection) => {
      return cloneElements(baseDoc, targetSelection, { x: 0, y: 0 });
    },
    []
  );

  const handleUpdateNode = useCallback(
    (id: string, patch: Partial<InfraNode>, coalesceKey?: string) => {
      setDocument(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        }),
        coalesceKey
      );
    },
    [setDocument]
  );

  const handleUpdateGroup = useCallback(
    (id: string, patch: Partial<InfraGroup>, coalesceKey?: string) => {
      setDocument(
        (prev) => ({
          ...prev,
          groups: prev.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        }),
        coalesceKey
      );
    },
    [setDocument]
  );

  const handleUpdateEdge = useCallback(
    (id: string, patch: Partial<InfraEdge>, coalesceKey?: string) => {
      setDocument(
        (prev) => ({
          ...prev,
          edges: prev.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }),
        coalesceKey
      );
    },
    [setDocument]
  );

  const handleUpdateText = useCallback(
    (id: string, patch: Partial<InfraText>, coalesceKey?: string) => {
      setDocument(
        (prev) => ({
          ...prev,
          texts: prev.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }),
        coalesceKey
      );
    },
    [setDocument]
  );

  const handleDeleteSelected = useCallback(() => {
    if (selection.length === 0) return;
    setDocument((prev) => deleteSelection(prev, selection));
    setSelection([]);
  }, [selection, setDocument]);

  const handleDuplicateSelected = useCallback(() => {
    if (selection.length === 0) return;
    const { nextDoc, clonedSelection } = cloneElements(doc, selection, { x: 28, y: 28 });
    if (clonedSelection.length === 0) return;
    setDocument(() => nextDoc);
    setSelection(clonedSelection);
  }, [doc, selection, setDocument]);

  const saveClipboardEnvelope = useCallback((envelope: ClipboardEnvelope) => {
    clipboardRef.current = envelope;
    setClipboardFallback(envelope);
    const json = JSON.stringify(envelope);
    try {
      localStorage.setItem(CLIPBOARD_STORAGE_KEY, json);
    } catch {
      // Ignore storage quota errors
    }
    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(json).catch(() => {});
      }
    } catch {
      // Ignore clipboard write errors
    }
  }, []);

  const handleCopy = useCallback(() => {
    const envelope = buildClipboardEnvelope(doc, selection);
    if (!envelope) return;
    saveClipboardEnvelope(envelope);
    showToast('Elemen disalin.');
  }, [doc, saveClipboardEnvelope, selection, showToast]);

  const handleCut = useCallback(() => {
    const envelope = buildClipboardEnvelope(doc, selection);
    if (!envelope) return;
    saveClipboardEnvelope(envelope);
    setDocument((prev) => deleteSelection(prev, selection));
    setSelection([]);
    showToast('Elemen dipotong.');
  }, [doc, saveClipboardEnvelope, selection, setDocument, showToast]);

  const handlePaste = useCallback(
    async (targetWorld?: { x: number; y: number }) => {
      let envelope: ClipboardEnvelope | null = null;
      try {
        const perm = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName });
        if (perm?.state === 'granted' && navigator.clipboard?.readText) {
          const text = await Promise.race([
            navigator.clipboard.readText(),
            new Promise<string>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 80)),
          ]);
          envelope = parseClipboardEnvelope(text);
        }
      } catch {
        // Ignore permission/read errors and use local clipboard
      }
      if (!envelope) {
        try {
          const saved = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
          if (saved) envelope = parseClipboardEnvelope(saved);
        } catch {
          // Ignore
        }
      }
      if (!envelope) envelope = clipboardRef.current ?? clipboardFallback;
      if (!envelope) return;

      let offset = { x: 32, y: 32 };
      if (targetWorld) {
        const allBoxes = [...envelope.groups, ...envelope.nodes, ...envelope.texts];
        if (allBoxes.length > 0) {
          const minX = Math.min(...allBoxes.map((b) => b.x));
          const minY = Math.min(...allBoxes.map((b) => b.y));
          offset = {
            x: snapValue(targetWorld.x - minX, snapToGrid),
            y: snapValue(targetWorld.y - minY, snapToGrid),
          };
        }
      }

      const { nextDoc, pastedSelection } = pasteClipboardEnvelope(latestDocRef.current, envelope, offset);
      if (pastedSelection.length === 0) return;
      setDocument(() => nextDoc);
      setSelection(pastedSelection);
    },
    [clipboardFallback, setDocument, snapToGrid]
  );

  const handleCopyStyle = useCallback(() => {
    if (selection.length === 0) return;
    const style = extractCopiedStyle(doc, selection[0]);
    if (!style) return;
    setCopiedStyle(style);
    showToast('Gaya komponen disalin.');
  }, [doc, selection, showToast]);

  const handlePasteStyle = useCallback(() => {
    if (!copiedStyle || selection.length === 0) return;
    setDocument((prev) => applyCopiedStyle(prev, selection, copiedStyle));
    showToast('Gaya diterapkan.');
  }, [copiedStyle, selection, setDocument, showToast]);

  const handleBulkSetColor = useCallback(
    (color: ColorTheme) => {
      if (selection.length === 0) return;
      setDocument((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          selectionHas(selection, 'node', n.id) ? { ...n, colorTheme: color } : n
        ),
        groups: prev.groups.map((g) =>
          selectionHas(selection, 'group', g.id) ? { ...g, colorTheme: color } : g
        ),
        texts: prev.texts.map((t) =>
          selectionHas(selection, 'text', t.id) ? { ...t, colorTheme: color } : t
        ),
        edges: prev.edges.map((e) =>
          selectionHas(selection, 'edge', e.id) ? { ...e, colorTheme: color } : e
        ),
      }));
    },
    [selection, setDocument]
  );

  const handleReorder = useCallback(
    (direction: 'forward' | 'backward' | 'front' | 'back') => {
      if (selection.length === 0) return;
      setDocument((prev) => reorderSelection(prev, selection, direction));
    },
    [selection, setDocument]
  );

  const isSelectionLocked = useMemo(() => {
    if (selection.length === 0) return false;
    return selection.every((s) => {
      if (s.kind === 'node') return Boolean(doc.nodes.find((n) => n.id === s.id)?.locked);
      if (s.kind === 'group') return Boolean(doc.groups.find((g) => g.id === s.id)?.locked);
      if (s.kind === 'text') return Boolean(doc.texts.find((t) => t.id === s.id)?.locked);
      return false;
    });
  }, [doc.groups, doc.nodes, doc.texts, selection]);

  const handleToggleLock = useCallback(() => {
    if (selection.length === 0) return;
    const nextLocked = !isSelectionLocked;
    setDocument((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        selectionHas(selection, 'node', n.id) ? { ...n, locked: nextLocked } : n
      ),
      groups: prev.groups.map((g) =>
        selectionHas(selection, 'group', g.id) ? { ...g, locked: nextLocked } : g
      ),
      texts: prev.texts.map((t) =>
        selectionHas(selection, 'text', t.id) ? { ...t, locked: nextLocked } : t
      ),
    }));
  }, [isSelectionLocked, selection, setDocument]);

  const handleSelectAll = useCallback(() => {
    setSelection([
      ...doc.groups.map((g) => ({ kind: 'group' as const, id: g.id })),
      ...doc.nodes.map((n) => ({ kind: 'node' as const, id: n.id })),
      ...doc.texts.map((t) => ({ kind: 'text' as const, id: t.id })),
      ...doc.edges.map((e) => ({ kind: 'edge' as const, id: e.id })),
    ]);
  }, [doc.edges, doc.groups, doc.nodes, doc.texts]);

  const handleSelectTemplate = useCallback(
    (template: ArchitectureTemplate) => {
      const nextDoc = template.build();
      setDocument(() => nextDoc);
      setSelection([]);
      setToolMode('select');
      window.requestAnimationFrame(() => fitToView(nextDoc));
      showToast(`Template "${template.name}" dimuat.`);
    },
    [fitToView, setDocument, showToast]
  );

  const handleLoadStarterTemplateById = useCallback(
    (templateId: string) => {
      const tpl = ARCHITECTURE_TEMPLATES.find((t) => t.id === templateId);
      if (tpl) handleSelectTemplate(tpl);
    },
    [handleSelectTemplate]
  );

  const handleClearCanvas = useCallback(() => {
    setDocument((prev) => ({
      ...prev,
      groups: [],
      nodes: [],
      texts: [],
      edges: [],
    }));
    setSelection([]);
    showToast('Kanvas dibersihkan. Gunakan Ctrl+Z untuk membatalkan.');
  }, [setDocument, showToast]);

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
        setDocument(() => result.doc);
        setSelection([]);
        setToolMode('select');
        window.requestAnimationFrame(() => fitToView(result.doc));
        showToast(`Diagram "${result.doc.title}" berhasil diimpor.`);
      };
      reader.onerror = () => {
        showToast('Gagal membaca file JSON.', 'error');
      };
      reader.readAsText(file);
    },
    [fitToView, setDocument, showToast]
  );

  // Global keyboard shortcuts (meta-guarded to prevent Ctrl+C/V/G conflicts)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (exportModalOpen || shortcutHelpOpen) return;

      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isEditing) return;

      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (meta && e.altKey && key === 'c') {
        e.preventDefault();
        handleCopyStyle();
        return;
      }
      if (meta && e.altKey && key === 'v') {
        e.preventDefault();
        handlePasteStyle();
        return;
      }

      if (meta && !e.altKey) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          handleRedo();
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          handleDuplicateSelected();
          return;
        }
        if (key === 'a') {
          e.preventDefault();
          handleSelectAll();
          return;
        }
        if (key === 'c') {
          e.preventDefault();
          void handleCopy();
          return;
        }
        if (key === 'x') {
          e.preventDefault();
          void handleCut();
          return;
        }
        if (key === 'v') {
          e.preventDefault();
          void handlePaste();
          return;
        }
        if (key === 'l') {
          e.preventDefault();
          handleToggleLock();
          return;
        }
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setViewport((prev) => ({
            ...prev,
            zoom: Math.min(2.2, Number((prev.zoom + 0.15).toFixed(2))),
          }));
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          setViewport((prev) => ({
            ...prev,
            zoom: Math.max(0.35, Number((prev.zoom - 0.15).toFixed(2))),
          }));
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          setViewport((prev) => ({ ...prev, zoom: 1 }));
          return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.length > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }

      if (
        selection.length > 0 &&
        !meta &&
        !e.altKey &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? GRID_SIZE : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setDocument((prev) => nudgeSelection(prev, selection, dx, dy), 'nudge');
        return;
      }

      if (!meta && !e.altKey) {
        if (key === 'v') setToolMode('select');
        else if (key === 'h') setToolMode('pan');
        else if (key === 'c') setToolMode('connect');
        else if (key === 't') setToolMode('text');
        else if (key === 'g') handleQuickAddGroup(CATALOG_GROUPS[0]);
        else if (e.key === ']') handleReorder(e.shiftKey ? 'front' : 'forward');
        else if (e.key === '[') handleReorder(e.shiftKey ? 'back' : 'backward');
        else if (e.key === '?') setShortcutHelpOpen((v) => !v);
        else if (e.key === 'Escape') {
          setSelection([]);
          setToolMode('select');
          setContextMenu(null);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    exportModalOpen,
    handleCopy,
    handleCopyStyle,
    handleCut,
    handleDeleteSelected,
    handleDuplicateSelected,
    handlePaste,
    handlePasteStyle,
    handleQuickAddGroup,
    handleRedo,
    handleReorder,
    handleSelectAll,
    handleToggleLock,
    handleUndo,
    selection,
    setDocument,
    shortcutHelpOpen,
  ]);

  const singleSel = selection.length === 1 ? selection[0] : null;
  const selectedNode = useMemo(
    () => (singleSel?.kind === 'node' ? doc.nodes.find((n) => n.id === singleSel.id) ?? null : null),
    [doc.nodes, singleSel]
  );
  const selectedGroup = useMemo(
    () => (singleSel?.kind === 'group' ? doc.groups.find((g) => g.id === singleSel.id) ?? null : null),
    [doc.groups, singleSel]
  );
  const selectedEdge = useMemo(
    () => (singleSel?.kind === 'edge' ? doc.edges.find((e) => e.id === singleSel.id) ?? null : null),
    [doc.edges, singleSel]
  );
  const selectedText = useMemo(
    () => (singleSel?.kind === 'text' ? doc.texts.find((t) => t.id === singleSel.id) ?? null : null),
    [doc.texts, singleSel]
  );

  const hasElements = doc.nodes.length > 0 || doc.groups.length > 0 || doc.texts.length > 0;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 text-slate-900">
      <Header
        title={doc.title}
        onTitleChange={(title) => setDocument((prev) => ({ ...prev, title }))}
        onSelectTemplate={handleSelectTemplate}
        onImportJsonFile={handleImportJsonFile}
        onExportJson={handleExportJson}
        onOpenExportModal={() => setExportModalOpen(true)}
        hasElements={hasElements}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <CatalogSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onQuickAddNode={handleQuickAddNode}
          onQuickAddGroup={handleQuickAddGroup}
          onQuickAddText={handleQuickAddText}
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
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onQuickAddVpc={() => handleQuickAddGroup(CATALOG_GROUPS[0])}
          onCreateTextAt={addTextAt}
          onDropCatalogItem={handleDropCatalogItem}
          onTransientDocument={setTransient}
          onCommitDragMove={handleCommitDragMove}
          onCommitDocument={commitBefore}
          onRevertTransient={revertTransient}
          onDuplicateForDrag={handleDuplicateForDrag}
          onUpdateNodeLabel={(id, label) => handleUpdateNode(id, { label })}
          onUpdateGroupLabel={(id, label) => handleUpdateGroup(id, { label })}
          onUpdateEdgeLabel={(id, label) => handleUpdateEdge(id, { label })}
          onUpdateTextContent={(id, text) => handleUpdateText(id, { text })}
          onCreateEdge={handleCreateEdge}
          onReconnectEdge={handleReconnectEdge}
          onDeleteSelected={handleDeleteSelected}
          onClearCanvas={handleClearCanvas}
          onFitToView={() => fitToView(doc)}
          onLoadStarterTemplate={handleLoadStarterTemplateById}
          onOpenShortcutHelp={() => setShortcutHelpOpen(true)}
          onOpenContextMenu={setContextMenu}
          canvasContainerRef={canvasContainerRef}
        />

        <InspectorPanel
          selection={selection}
          selectedNode={selectedNode}
          selectedGroup={selectedGroup}
          selectedEdge={selectedEdge}
          selectedText={selectedText}
          hasCopiedStyle={Boolean(copiedStyle)}
          isSelectionLocked={isSelectionLocked}
          onUpdateNode={handleUpdateNode}
          onUpdateGroup={handleUpdateGroup}
          onUpdateEdge={handleUpdateEdge}
          onUpdateText={handleUpdateText}
          onBulkSetColor={handleBulkSetColor}
          onReorder={handleReorder}
          onToggleLock={handleToggleLock}
          onCopyStyle={handleCopyStyle}
          onPasteStyle={handlePasteStyle}
          onDuplicateSelected={handleDuplicateSelected}
          onDeleteSelected={handleDeleteSelected}
          onClose={() => setSelection([])}
        />
      </div>

      <ExportModal
        open={exportModalOpen}
        doc={doc}
        selection={selection}
        onClose={() => setExportModalOpen(false)}
        onNotify={showToast}
      />

      <ShortcutHelpModal open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />

      <ContextMenu
        menu={contextMenu}
        hasSelection={selection.length > 0}
        hasClipboard={Boolean(clipboardFallback)}
        hasCopiedStyle={Boolean(copiedStyle)}
        isLocked={isSelectionLocked}
        onClose={() => setContextMenu(null)}
        onCopy={() => void handleCopy()}
        onCut={() => void handleCut()}
        onPasteAt={(wx, wy) => void handlePaste({ x: wx, y: wy })}
        onDuplicate={handleDuplicateSelected}
        onCopyStyle={handleCopyStyle}
        onPasteStyle={handlePasteStyle}
        onBringFront={() => handleReorder('front')}
        onSendBack={() => handleReorder('back')}
        onToggleLock={handleToggleLock}
        onSelectAll={handleSelectAll}
        onFitToView={() => fitToView(doc)}
        onDelete={handleDeleteSelected}
      />

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
