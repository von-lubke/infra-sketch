import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpToLine,
  Copy,
  Lock,
  Paintbrush,
  PanelRightClose,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { COLOR_THEME_LIST, ICON_LABELS, ICON_PATHS, PROVIDER_LABELS } from '../data/catalog';
import {
  ArrowHeadMode,
  ColorTheme,
  EdgeRouting,
  InfraEdge,
  InfraGroup,
  InfraNode,
  InfraText,
  Selection,
} from '../types/diagram';
import { InfraIcon } from './InfraIcon';

interface InspectorPanelProps {
  selection: Selection;
  selectedNode: InfraNode | null;
  selectedGroup: InfraGroup | null;
  selectedEdge: InfraEdge | null;
  selectedText: InfraText | null;
  hasCopiedStyle: boolean;
  isSelectionLocked: boolean;
  onUpdateNode: (id: string, patch: Partial<InfraNode>, coalesceKey?: string) => void;
  onUpdateGroup: (id: string, patch: Partial<InfraGroup>, coalesceKey?: string) => void;
  onUpdateEdge: (id: string, patch: Partial<InfraEdge>, coalesceKey?: string) => void;
  onUpdateText: (id: string, patch: Partial<InfraText>, coalesceKey?: string) => void;
  onBulkSetColor: (color: ColorTheme) => void;
  onReorder: (direction: 'forward' | 'backward' | 'front' | 'back') => void;
  onToggleLock: () => void;
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onClose: () => void;
}

const ICON_KEYS = Object.keys(ICON_PATHS);

export function InspectorPanel({
  selection,
  selectedNode,
  selectedGroup,
  selectedEdge,
  selectedText,
  hasCopiedStyle,
  isSelectionLocked,
  onUpdateNode,
  onUpdateGroup,
  onUpdateEdge,
  onUpdateText,
  onBulkSetColor,
  onReorder,
  onToggleLock,
  onCopyStyle,
  onPasteStyle,
  onDuplicateSelected,
  onDeleteSelected,
  onClose,
}: InspectorPanelProps) {
  if (selection.length === 0) return null;

  const isMulti = selection.length > 1;
  const heading = isMulti
    ? `${selection.length} Elemen Dipilih`
    : selectedNode
      ? 'Properti Komponen'
      : selectedGroup
        ? 'Properti Container'
        : selectedText
          ? 'Properti Catatan'
          : 'Properti Konektor';

  const currentColor: ColorTheme | null = isMulti
    ? null
    : selectedNode
      ? selectedNode.colorTheme
      : selectedGroup
        ? selectedGroup.colorTheme
        : selectedText
          ? selectedText.colorTheme
          : selectedEdge
            ? selectedEdge.colorTheme
            : null;

  const handleColorSelect = (color: ColorTheme) => {
    if (isMulti) {
      onBulkSetColor(color);
    } else if (selectedNode) {
      onUpdateNode(selectedNode.id, { colorTheme: color });
    } else if (selectedGroup) {
      onUpdateGroup(selectedGroup.id, { colorTheme: color });
    } else if (selectedText) {
      onUpdateText(selectedText.id, { colorTheme: color });
    } else if (selectedEdge) {
      onUpdateEdge(selectedEdge.id, { colorTheme: color });
    }
  };

  const canDuplicate = isMulti
    ? selection.some((s) => s.kind !== 'edge')
    : Boolean(selectedNode || selectedGroup || selectedText);

  return (
    <aside className="w-[264px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full z-20">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-slate-900 truncate">{heading}</h2>
          {!isMulti && selectedNode && (
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {PROVIDER_LABELS[selectedNode.provider]} · {selectedNode.type}
            </p>
          )}
          {!isMulti && selectedGroup && (
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
              {Math.round(selectedGroup.width)} × {Math.round(selectedGroup.height)} px
            </p>
          )}
          {!isMulti && selectedText && (
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
              {Math.round(selectedText.width)} × {Math.round(selectedText.height)} px
            </p>
          )}
          {isMulti && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              Edit gaya, urutan, atau posisi massal
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Tutup panel properti"
          aria-label="Tutup panel properti"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer shrink-0"
        >
          {isMulti ? <X className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Single Node Fields */}
        {!isMulti && selectedNode && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="node-label-input" className="block text-xs font-medium text-slate-700">
                Label Layanan
              </label>
              <input
                id="node-label-input"
                type="text"
                value={selectedNode.label}
                onChange={(e) =>
                  onUpdateNode(selectedNode.id, { label: e.target.value }, `node:${selectedNode.id}:label`)
                }
                placeholder="Nama komponen..."
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="node-sublabel-input" className="block text-xs font-medium text-slate-700">
                Spesifikasi / Port
              </label>
              <input
                id="node-sublabel-input"
                type="text"
                value={selectedNode.sublabel}
                onChange={(e) =>
                  onUpdateNode(selectedNode.id, { sublabel: e.target.value }, `node:${selectedNode.id}:sublabel`)
                }
                placeholder="Misal: t3.medium, Port 5432"
                className="w-full px-3 py-2 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">Ikon Komponen</span>
              <div className="grid grid-cols-6 gap-1.5">
                {ICON_KEYS.map((key) => {
                  const active = selectedNode.iconKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      title={ICON_LABELS[key] ?? key}
                      aria-label={`Pilih ikon ${ICON_LABELS[key] ?? key}`}
                      onClick={() => onUpdateNode(selectedNode.id, { iconKey: key })}
                      className={`h-8 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
                        active
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <InfraIcon iconKey={key} size={15} />
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Single Group Fields */}
        {!isMulti && selectedGroup && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="group-label-input" className="block text-xs font-medium text-slate-700">
                Nama VPC / Subnet
              </label>
              <input
                id="group-label-input"
                type="text"
                value={selectedGroup.label}
                onChange={(e) =>
                  onUpdateGroup(selectedGroup.id, { label: e.target.value }, `group:${selectedGroup.id}:label`)
                }
                placeholder="Misal: Production VPC"
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="group-meta-input" className="block text-xs font-medium text-slate-700">
                CIDR / Region
              </label>
              <input
                id="group-meta-input"
                type="text"
                value={selectedGroup.meta}
                onChange={(e) =>
                  onUpdateGroup(selectedGroup.id, { meta: e.target.value }, `group:${selectedGroup.id}:meta`)
                }
                placeholder="Misal: 10.0.1.0/24"
                className="w-full px-3 py-2 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>
          </>
        )}

        {/* Single Text/Note Fields */}
        {!isMulti && selectedText && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="text-content-input" className="block text-xs font-medium text-slate-700">
                Isi Catatan / Teks
              </label>
              <textarea
                id="text-content-input"
                rows={4}
                value={selectedText.text}
                onChange={(e) =>
                  onUpdateText(selectedText.id, { text: e.target.value }, `text:${selectedText.id}:text`)
                }
                placeholder="Tulis catatan arsitektur..."
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors resize-y"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">Tipe Anotasi</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['note', 'text'] as const).map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => onUpdateText(selectedText.id, { variant })}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      selectedText.variant === variant
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {variant === 'note' ? 'Sticky Note' : 'Teks Polos'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Single Edge Fields */}
        {!isMulti && selectedEdge && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="edge-label-input" className="block text-xs font-medium text-slate-700">
                Label Aliran / Protokol
              </label>
              <input
                id="edge-label-input"
                type="text"
                value={selectedEdge.label}
                onChange={(e) =>
                  onUpdateEdge(selectedEdge.id, { label: e.target.value }, `edge:${selectedEdge.id}:label`)
                }
                placeholder="Misal: HTTPS, gRPC, TCP 5432"
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">Gaya Garis</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['solid', 'dashed'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => onUpdateEdge(selectedEdge.id, { lineStyle: style })}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      selectedEdge.lineStyle === style
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {style === 'solid' ? 'Solid' : 'Putus-putus'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">Bentuk Jalur</span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['curved', 'straight', 'orthogonal'] as EdgeRouting[]).map((routing) => (
                  <button
                    key={routing}
                    type="button"
                    onClick={() => onUpdateEdge(selectedEdge.id, { routing })}
                    className={`py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                      selectedEdge.routing === routing
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {routing === 'curved' ? 'Lengkung' : routing === 'straight' ? 'Lurus' : 'Siku'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">Arah Panah</span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['end', 'both', 'none'] as ArrowHeadMode[]).map((arrowHead) => (
                  <button
                    key={arrowHead}
                    type="button"
                    onClick={() => onUpdateEdge(selectedEdge.id, { arrowHead })}
                    className={`py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                      selectedEdge.arrowHead === arrowHead
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {arrowHead === 'end' ? '1 Arah' : arrowHead === 'both' ? '2 Arah' : 'Polos'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  onUpdateEdge(selectedEdge.id, {
                    sourceId: selectedEdge.targetId,
                    sourceKind: selectedEdge.targetKind,
                    sourceAnchor: selectedEdge.targetAnchor,
                    targetId: selectedEdge.sourceId,
                    targetKind: selectedEdge.sourceKind,
                    targetAnchor: selectedEdge.sourceAnchor,
                  })
                }
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Balik Arah Koneksi</span>
              </button>
            </div>
          </>
        )}

        {/* Color Theme Swatches */}
        <div className="space-y-2">
          <span className="block text-xs font-medium text-slate-700">Warna Sketsa</span>
          <div className="grid grid-cols-7 gap-1.5">
            {COLOR_THEME_LIST.map((theme) => {
              const isSelected = currentColor === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  title={theme.label}
                  onClick={() => handleColorSelect(theme.id)}
                  aria-label={`Pilih warna ${theme.label}`}
                  className={`h-7 rounded-md border transition-transform cursor-pointer flex items-center justify-center ${
                    isSelected ? 'ring-2 ring-indigo-600 ring-offset-1 scale-105' : 'hover:scale-105'
                  }`}
                  style={{
                    backgroundColor: theme.fill,
                    borderColor: theme.stroke,
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.stroke }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Layering, Style Copy/Paste, Lock */}
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <span className="block text-xs font-medium text-slate-700">Urutan & Gaya</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onReorder('front')}
              className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
            >
              <ArrowUpToLine className="w-3.5 h-3.5" />
              <span>Ke Depan</span>
            </button>
            <button
              type="button"
              onClick={() => onReorder('back')}
              className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              <span>Ke Belakang</span>
            </button>
            <button
              type="button"
              onClick={onCopyStyle}
              className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
            >
              <Paintbrush className="w-3.5 h-3.5" />
              <span>Salin Gaya</span>
            </button>
            <button
              type="button"
              disabled={!hasCopiedStyle}
              onClick={onPasteStyle}
              className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg cursor-pointer"
            >
              <Paintbrush className="w-3.5 h-3.5" />
              <span>Tempel Gaya</span>
            </button>
          </div>

          {!selectedEdge && (
            <button
              type="button"
              onClick={onToggleLock}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border rounded-lg cursor-pointer transition-colors ${
                isSelectionLocked
                  ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {isSelectionLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{isSelectionLocked ? 'Buka Kunci Posisi' : 'Kunci Posisi'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 flex items-center gap-2">
        {canDuplicate && (
          <button
            type="button"
            onClick={onDuplicateSelected}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplikat</span>
          </button>
        )}
        <button
          type="button"
          onClick={onDeleteSelected}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus</span>
        </button>
      </div>
    </aside>
  );
}
