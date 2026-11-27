import React, { useMemo, useState } from 'react';
import { BoxSelect, PanelLeftClose, PanelLeftOpen, Search, StickyNote, X } from 'lucide-react';
import {
  CATALOG_COMPONENTS,
  CATALOG_GROUPS,
  COLOR_THEMES,
  PROVIDER_LABELS,
} from '../data/catalog';
import { CatalogComponent, CatalogGroup, Provider } from '../types/diagram';
import { InfraIcon } from './InfraIcon';

interface CatalogSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onQuickAddNode: (component: CatalogComponent) => void;
  onQuickAddGroup: (group: CatalogGroup) => void;
  onQuickAddText: (variant: 'note' | 'text') => void;
}

const PROVIDER_TABS: Array<Provider | 'all'> = ['all', 'generic', 'aws', 'gcp', 'azure', 'k8s'];

export function CatalogSidebar({
  collapsed,
  onToggleCollapse,
  onQuickAddNode,
  onQuickAddGroup,
  onQuickAddText,
}: CatalogSidebarProps) {
  const [search, setSearch] = useState('');
  const [activeProvider, setActiveProvider] = useState<Provider | 'all'>('all');

  const filteredComponents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CATALOG_COMPONENTS.filter((item) => {
      if (activeProvider !== 'all' && item.provider !== activeProvider) return false;
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.defaultSublabel.toLowerCase().includes(q) ||
        item.provider.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [search, activeProvider]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATALOG_GROUPS;
    return CATALOG_GROUPS.filter(
      (g) => g.label.toLowerCase().includes(q) || g.defaultMeta.toLowerCase().includes(q)
    );
  }, [search]);

  const handleDragStartNode = (e: React.DragEvent, component: CatalogComponent) => {
    e.dataTransfer.setData('application/infrasketch-item', JSON.stringify({ itemKind: 'node', id: component.id }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragStartGroup = (e: React.DragEvent, group: CatalogGroup) => {
    e.dataTransfer.setData('application/infrasketch-item', JSON.stringify({ itemKind: 'group', kind: group.kind }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragStartText = (e: React.DragEvent, variant: 'note' | 'text') => {
    e.dataTransfer.setData('application/infrasketch-item', JSON.stringify({ itemKind: 'text', variant }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  if (collapsed) {
    return (
      <div className="shrink-0 bg-white border-r border-slate-200 flex flex-col items-center py-3 px-1.5 z-20">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Buka Sidebar Katalog"
          aria-label="Buka sidebar katalog"
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-[264px] shrink-0 bg-white border-r border-slate-200 flex flex-col h-full z-20">
      {/* Header + Search + Provider Filter */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-800">Katalog Komponen</span>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Sembunyikan Sidebar"
            aria-label="Sembunyikan sidebar katalog"
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari komponen cloud..."
            className="w-full pl-8 pr-7 py-2 text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Hapus pencarian"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Provider Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
          {PROVIDER_TABS.map((prov) => {
            const active = activeProvider === prov;
            return (
              <button
                key={prov}
                type="button"
                onClick={() => setActiveProvider(prov)}
                className={`py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {PROVIDER_LABELS[prov]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Component Catalog */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Container Groups */}
        {filteredGroups.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-xs font-semibold text-slate-700">Container Grup</h2>
              <span className="text-[11px] text-slate-400 tabular-nums">{filteredGroups.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {filteredGroups.map((group) => {
                const theme = COLOR_THEMES[group.colorTheme];
                return (
                  <button
                    key={group.kind}
                    type="button"
                    draggable
                    onDragStart={(e) => handleDragStartGroup(e, group)}
                    onClick={() => onQuickAddGroup(group)}
                    title={`Seret atau klik untuk menambah ${group.label}`}
                    className="group flex flex-col items-start gap-1.5 p-2.5 rounded-lg border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-slate-50/90 text-left transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: theme.iconBg, color: theme.iconColor }}
                    >
                      <BoxSelect className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 w-full">
                      <div className="text-xs font-medium text-slate-800 truncate">{group.label}</div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">{group.defaultMeta}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Sticky Note & Free Text */}
        {!search.trim() && (
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-xs font-semibold text-slate-700">Anotasi</h2>
              <span className="text-[11px] text-slate-400 tabular-nums">2</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                draggable
                onDragStart={(e) => handleDragStartText(e, 'note')}
                onClick={() => onQuickAddText('note')}
                title="Seret atau klik untuk menambah Sticky Note"
                className="flex flex-col items-start gap-1.5 p-2.5 rounded-lg border border-amber-200 bg-amber-50/70 hover:border-amber-400 text-left transition-colors cursor-grab active:cursor-grabbing"
              >
                <div className="w-7 h-7 rounded-md flex items-center justify-center bg-amber-100 text-amber-700">
                  <StickyNote className="w-4 h-4" />
                </div>
                <div className="min-w-0 w-full">
                  <div className="text-xs font-medium text-slate-800 truncate">Sticky Note</div>
                  <div className="text-[10px] text-slate-500 truncate">Catatan sketsa</div>
                </div>
              </button>

              <button
                type="button"
                draggable
                onDragStart={(e) => handleDragStartText(e, 'text')}
                onClick={() => onQuickAddText('text')}
                title="Seret atau klik untuk menambah Teks Bebas"
                className="flex flex-col items-start gap-1.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-400 text-left transition-colors cursor-grab active:cursor-grabbing"
              >
                <div className="w-7 h-7 rounded-md flex items-center justify-center bg-slate-100 text-slate-700 font-bold text-xs">
                  T
                </div>
                <div className="min-w-0 w-full">
                  <div className="text-xs font-medium text-slate-800 truncate">Teks Bebas</div>
                  <div className="text-[10px] text-slate-500 truncate">Judul / Legenda</div>
                </div>
              </button>
            </div>
          </section>
        )}

        {/* Cloud Components */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-semibold text-slate-700">Komponen Cloud</h2>
            <span className="text-[11px] text-slate-400 tabular-nums">{filteredComponents.length}</span>
          </div>

          {filteredComponents.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-slate-500">Komponen tidak ditemukan.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setActiveProvider('all');
                }}
                className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                Reset filter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredComponents.map((comp) => {
                const theme = COLOR_THEMES[comp.colorTheme];
                return (
                  <button
                    key={comp.id}
                    type="button"
                    draggable
                    onDragStart={(e) => handleDragStartNode(e, comp)}
                    onClick={() => onQuickAddNode(comp)}
                    title={`Seret atau klik untuk menambah ${comp.label}`}
                    className="group flex flex-col items-start gap-1.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-400 hover:bg-slate-50/80 text-left transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: theme.iconBg, color: theme.iconColor }}
                      >
                        <InfraIcon iconKey={comp.iconKey} size={16} />
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {PROVIDER_LABELS[comp.provider]}
                      </span>
                    </div>
                    <div className="min-w-0 w-full">
                      <div className="text-xs font-medium text-slate-800 truncate">{comp.label}</div>
                      <div className="text-[10px] text-slate-400 truncate">{comp.defaultSublabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Subtle Usage Tip */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/70 text-[11px] text-slate-500 leading-relaxed">
        Seret item ke kanvas atau klik langsung. Tahan Ctrl+Drag di kanvas untuk duplikat.
      </div>
    </aside>
  );
}
