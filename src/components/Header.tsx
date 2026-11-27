import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileJson, Image as ImageIcon, Layers, Upload } from 'lucide-react';
import { ARCHITECTURE_TEMPLATES, ArchitectureTemplate } from '../data/templates';

interface HeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  onSelectTemplate: (template: ArchitectureTemplate) => void;
  onImportJsonFile: (file: File) => void;
  onExportJson: () => void;
  onOpenExportModal: () => void;
  hasElements: boolean;
}

export function Header({
  title,
  onTitleChange,
  onSelectTemplate,
  onImportJsonFile,
  onExportJson,
  onOpenExportModal,
  hasElements,
}: HeaderProps) {
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!templateMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setTemplateMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTemplateMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [templateMenuOpen]);

  const startEditingTitle = () => {
    setDraftTitle(title);
    setIsEditingTitle(true);
  };

  const commitTitle = () => {
    setIsEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== title) {
      onTitleChange(trimmed);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJsonFile(file);
    }
    e.target.value = '';
  };

  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-5 flex items-center justify-between gap-6 z-30">
      {/* Zone 1: Brand & Editable Document Title */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          InfraSketch
        </span>
        <span className="text-slate-300 select-none" aria-hidden="true">/</span>
        {isEditingTitle ? (
          <input
            type="text"
            value={draftTitle}
            autoFocus
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') {
                setIsEditingTitle(false);
              }
            }}
            className="text-sm font-medium text-slate-900 bg-slate-50 border border-indigo-400 rounded-md px-2 py-1 outline-none w-52"
            aria-label="Judul diagram"
          />
        ) : (
          <button
            type="button"
            onClick={startEditingTitle}
            title="Klik untuk ubah nama diagram"
            className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md px-2 py-1 transition-colors truncate max-w-[220px] whitespace-nowrap cursor-text"
          >
            {title}
          </button>
        )}
      </div>

      {/* Zone 2: Template Selector */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setTemplateMenuOpen((v) => !v)}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5 text-slate-500" />
          <span>Template Arsitektur</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${templateMenuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {templateMenuOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50 max-h-[75vh] overflow-y-auto">
            <div className="px-3.5 py-1.5 text-xs font-medium text-slate-400 border-b border-slate-100">
              Pilih template siap pakai
            </div>
            {ARCHITECTURE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  onSelectTemplate(tpl);
                  setTemplateMenuOpen(false);
                }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="text-sm font-medium text-slate-900">{tpl.name}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-snug">{tpl.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Zone 3: Import & Export Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Import file JSON"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden sm:inline">Import JSON</span>
        </button>

        <button
          type="button"
          onClick={onExportJson}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <FileJson className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden sm:inline">Export JSON</span>
        </button>

        <button
          type="button"
          onClick={onOpenExportModal}
          disabled={!hasElements}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Export</span>
          <Download className="w-3 h-3 opacity-80" />
        </button>
      </div>
    </header>
  );
}
