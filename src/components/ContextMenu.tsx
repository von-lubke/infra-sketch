import { useEffect, useRef } from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Clipboard,
  Copy,
  Lock,
  Maximize2,
  Paintbrush,
  Scissors,
  Trash2,
} from 'lucide-react';

export interface ContextMenuState {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
}

interface ContextMenuProps {
  menu: ContextMenuState | null;
  hasSelection: boolean;
  hasClipboard: boolean;
  hasCopiedStyle: boolean;
  isLocked: boolean;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPasteAt: (worldX: number, worldY: number) => void;
  onDuplicate: () => void;
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
  onToggleLock: () => void;
  onSelectAll: () => void;
  onFitToView: () => void;
  onDelete: () => void;
}

export function ContextMenu({
  menu,
  hasSelection,
  hasClipboard,
  hasCopiedStyle,
  isLocked,
  onClose,
  onCopy,
  onCut,
  onPasteAt,
  onDuplicate,
  onCopyStyle,
  onPasteStyle,
  onBringFront,
  onSendBack,
  onToggleLock,
  onSelectAll,
  onFitToView,
  onDelete,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const left = Math.min(menu.clientX, window.innerWidth - 230);
  const top = Math.min(menu.clientY, window.innerHeight - (hasSelection ? 350 : 160));

  const itemClass =
    'w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-between gap-4 text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div
      ref={ref}
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      className="fixed z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5"
    >
      {hasSelection ? (
        <>
          <button
            type="button"
            onClick={() => {
              onDuplicate();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              Duplikat
            </span>
            <kbd className="text-[10px] font-mono text-slate-400">Ctrl+D</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onCopy();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              Salin
            </span>
            <kbd className="text-[10px] font-mono text-slate-400">Ctrl+C</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onCut();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Scissors className="w-3.5 h-3.5 text-slate-500" />
              Potong
            </span>
            <kbd className="text-[10px] font-mono text-slate-400">Ctrl+X</kbd>
          </button>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => {
              onCopyStyle();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Paintbrush className="w-3.5 h-3.5 text-slate-500" />
              Salin Gaya
            </span>
            <kbd className="text-[10px] font-mono text-slate-400">Ctrl+Alt+C</kbd>
          </button>
          <button
            type="button"
            disabled={!hasCopiedStyle}
            onClick={() => {
              onPasteStyle();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Paintbrush className="w-3.5 h-3.5 text-slate-500" />
              Tempel Gaya
            </span>
            <kbd className="text-[10px] font-mono text-slate-400">Ctrl+Alt+V</kbd>
          </button>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => {
              onBringFront();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <ArrowUpToLine className="w-3.5 h-3.5 text-slate-500" />
              Bawa ke Depan
            </span>
            <kbd className="text-[10px] font-mono text-slate-400">]</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onSendBack();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <ArrowDownToLine className="w-3.5 h-3.5 text-slate-500" />
              Kirim ke Belakang
            </span>
            <kbd className="text-[10px] font-mono text-slate-400">[</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onToggleLock();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              {isLocked ? 'Buka Kunci' : 'Kunci Posisi'}
            </span>
            <kbd className="text-[10px] font-mono text-slate-400">Ctrl+L</kbd>
          </button>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center justify-between gap-4 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              Hapus
            </span>
            <kbd className="text-[10px] font-mono text-rose-400">Del</kbd>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={!hasClipboard}
            onClick={() => {
              onPasteAt(menu.worldX, menu.worldY);
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Clipboard className="w-3.5 h-3.5 text-slate-500" />
              Tempel di Sini
            </span>
            <kbd className="text-[10px] font-mono text-slate-400">Ctrl+V</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectAll();
              onClose();
            }}
            className={itemClass}
          >
            <span>Pilih Semua</span>
            <kbd className="text-[10px] font-mono text-slate-400">Ctrl+A</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onFitToView();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
              Paskan ke Layar
            </span>
          </button>
        </>
      )}
    </div>
  );
}
