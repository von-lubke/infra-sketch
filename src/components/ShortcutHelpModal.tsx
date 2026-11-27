import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutHelpModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS: Array<{ title: string; items: Array<{ keys: string; desc: string }> }> = [
  {
    title: 'Alat & Navigasi',
    items: [
      { keys: 'V / H / C / T', desc: 'Mode Pilih, Geser (Pan), Konektor, atau Teks/Note' },
      { keys: 'G', desc: 'Tambah Container VPC baru' },
      { keys: 'Spasi + Drag', desc: 'Geser kanvas sementara' },
      { keys: 'Scroll / Trackpad', desc: 'Geser kanvas (Ctrl/⌘ + Scroll untuk Zoom)' },
      { keys: 'Ctrl + = / - / 0', desc: 'Perbesar, perkecil, atau reset zoom 100%' },
    ],
  },
  {
    title: 'Seleksi & Duplikat',
    items: [
      { keys: 'Ctrl / Alt + Drag', desc: 'Duplikat komponen/container beserta propertinya (ala Figma)' },
      { keys: 'Shift + Klik / Drag', desc: 'Tambah seleksi atau buat kotak seleksi (marquee)' },
      { keys: 'Ctrl + A', desc: 'Pilih semua elemen di kanvas' },
      { keys: 'Ctrl + C / X / V', desc: 'Salin, potong, dan tempel antar kanvas / tab' },
      { keys: 'Ctrl + D', desc: 'Duplikat elemen terpilih di tempat' },
      { keys: 'Ctrl + Alt + C / V', desc: 'Salin dan tempel gaya/warna properti komponen' },
    ],
  },
  {
    title: 'Tata Letak & Riwayat',
    items: [
      { keys: 'Panah / Shift+Panah', desc: 'Geser presisi 1 px atau lompat 20 px' },
      { keys: '] / [', desc: 'Bawa elemen ke depan atau kirim ke belakang' },
      { keys: 'Ctrl + L', desc: 'Kunci / buka kunci posisi elemen' },
      { keys: 'Ctrl + Z / Y', desc: 'Urungkan (Undo) atau Ulangi (Redo)' },
      { keys: 'Double-click', desc: 'Edit label node, container, panah, atau catatan' },
      { keys: 'Del / Backspace', desc: 'Hapus elemen terpilih' },
    ],
  },
];

export function ShortcutHelpModal({ open, onClose }: ShortcutHelpModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-indigo-600" />
            <h2 className="text-base font-semibold text-slate-900">Pintasan Keyboard & Kanvas</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup bantuan pintasan"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                {group.title}
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {group.items.map((item) => (
                  <div key={item.keys} className="px-3.5 py-2 flex items-center justify-between gap-4 bg-white">
                    <span className="text-xs text-slate-700">{item.desc}</span>
                    <kbd className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 text-slate-800 border border-slate-200 rounded-md whitespace-nowrap shrink-0">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
