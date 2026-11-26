import { ArrowLeftRight, Copy, Trash2, X } from 'lucide-react';
import { COLOR_THEME_LIST, PROVIDER_LABELS } from '../data/catalog';
import { ColorTheme, InfraEdge, InfraGroup, InfraNode } from '../types/diagram';

interface InspectorPanelProps {
  selectedNode: InfraNode | null;
  selectedGroup: InfraGroup | null;
  selectedEdge: InfraEdge | null;
  onUpdateNode: (id: string, patch: Partial<InfraNode>) => void;
  onUpdateGroup: (id: string, patch: Partial<InfraGroup>) => void;
  onUpdateEdge: (id: string, patch: Partial<InfraEdge>) => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onClose: () => void;
}

export function InspectorPanel({
  selectedNode,
  selectedGroup,
  selectedEdge,
  onUpdateNode,
  onUpdateGroup,
  onUpdateEdge,
  onDuplicateSelected,
  onDeleteSelected,
  onClose,
}: InspectorPanelProps) {
  if (!selectedNode && !selectedGroup && !selectedEdge) return null;

  const heading = selectedNode
    ? 'Properti Komponen'
    : selectedGroup
      ? 'Properti Container'
      : 'Properti Konektor';

  const currentColor: ColorTheme = selectedNode
    ? selectedNode.colorTheme
    : selectedGroup
      ? selectedGroup.colorTheme
      : selectedEdge!.colorTheme;

  const handleColorSelect = (color: ColorTheme) => {
    if (selectedNode) onUpdateNode(selectedNode.id, { colorTheme: color });
    else if (selectedGroup) onUpdateGroup(selectedGroup.id, { colorTheme: color });
    else if (selectedEdge) onUpdateEdge(selectedEdge.id, { colorTheme: color });
  };

  return (
    <aside className="w-[264px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full z-20">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold text-slate-900">{heading}</h2>
          {selectedNode && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              {PROVIDER_LABELS[selectedNode.provider]} · {selectedNode.type}
            </p>
          )}
          {selectedGroup && (
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
              {Math.round(selectedGroup.width)} × {Math.round(selectedGroup.height)} px
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel properti"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Node Fields */}
        {selectedNode && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="node-label-input" className="block text-xs font-medium text-slate-700">
                Label Layanan
              </label>
              <input
                id="node-label-input"
                type="text"
                value={selectedNode.label}
                onChange={(e) => onUpdateNode(selectedNode.id, { label: e.target.value })}
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
                onChange={(e) => onUpdateNode(selectedNode.id, { sublabel: e.target.value })}
                placeholder="Misal: t3.medium, Port 5432"
                className="w-full px-3 py-2 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>
          </>
        )}

        {/* Group Fields */}
        {selectedGroup && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="group-label-input" className="block text-xs font-medium text-slate-700">
                Nama VPC / Subnet
              </label>
              <input
                id="group-label-input"
                type="text"
                value={selectedGroup.label}
                onChange={(e) => onUpdateGroup(selectedGroup.id, { label: e.target.value })}
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
                onChange={(e) => onUpdateGroup(selectedGroup.id, { meta: e.target.value })}
                placeholder="Misal: 10.0.1.0/24"
                className="w-full px-3 py-2 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>
          </>
        )}

        {/* Edge Fields */}
        {selectedEdge && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="edge-label-input" className="block text-xs font-medium text-slate-700">
                Label Aliran / Protokol
              </label>
              <input
                id="edge-label-input"
                type="text"
                value={selectedEdge.label}
                onChange={(e) => onUpdateEdge(selectedEdge.id, { label: e.target.value })}
                placeholder="Misal: HTTPS, gRPC, TCP 5432"
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">Gaya Garis</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => onUpdateEdge(selectedEdge.id, { lineStyle: 'solid' })}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    selectedEdge.lineStyle === 'solid'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Solid
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateEdge(selectedEdge.id, { lineStyle: 'dashed' })}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    selectedEdge.lineStyle === 'dashed'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Putus-putus
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">Bentuk Jalur</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => onUpdateEdge(selectedEdge.id, { curveType: 'curved' })}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    selectedEdge.curveType === 'curved'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lengkung
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateEdge(selectedEdge.id, { curveType: 'straight' })}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    selectedEdge.curveType === 'straight'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lurus
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">Arah Panah</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => onUpdateEdge(selectedEdge.id, { bidirectional: false })}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    !selectedEdge.bidirectional
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Satu Arah
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateEdge(selectedEdge.id, { bidirectional: true })}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    selectedEdge.bidirectional
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Dua Arah
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  onUpdateEdge(selectedEdge.id, {
                    sourceId: selectedEdge.targetId,
                    sourceAnchor: selectedEdge.targetAnchor,
                    targetId: selectedEdge.sourceId,
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
                    isSelected
                      ? 'ring-2 ring-indigo-600 ring-offset-1 scale-105'
                      : 'hover:scale-105'
                  }`}
                  style={{
                    backgroundColor: theme.fill,
                    borderColor: theme.stroke,
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: theme.stroke }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 flex items-center gap-2">
        {(selectedNode || selectedGroup) && (
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
