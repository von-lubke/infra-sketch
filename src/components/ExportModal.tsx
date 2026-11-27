import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, X } from 'lucide-react';
import { DiagramDocument, ExportOptions, Selection } from '../types/diagram';
import {
  buildDiagramSvgString,
  copyDiagramPngToClipboard,
  downloadDiagramAsPng,
  downloadDiagramAsSvg,
  renderDiagramToCanvas,
} from '../utils/exportImport';

interface ExportModalProps {
  open: boolean;
  doc: DiagramDocument;
  selection: Selection;
  onClose: () => void;
  onNotify: (text: string, tone?: 'neutral' | 'error') => void;
}

export function ExportModal({ open, doc, selection, onClose, onNotify }: ExportModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'png',
    background: 'white',
    scale: 2,
    padding: 40,
    selectionOnly: false,
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const hasSelection = selection.length > 0;
  const effectiveOptions = useMemo(
    () => ({
      ...options,
      selectionOnly: hasSelection && options.selectionOnly,
    }),
    [hasSelection, options]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const generatePreview = async () => {
      if (effectiveOptions.format === 'svg') {
        const built = buildDiagramSvgString(doc, effectiveOptions, selection);
        if (cancelled || !built) return;
        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(built.svg)}`;
        setDimensions({ w: built.width, h: built.height });
        setPreviewUrl(url);
        return;
      }

      const rendered = await renderDiagramToCanvas(doc, effectiveOptions, selection);
      if (cancelled || !rendered) return;
      setDimensions({
        w: rendered.width * effectiveOptions.scale,
        h: rendered.height * effectiveOptions.scale,
      });
      setPreviewUrl(rendered.canvas.toDataURL('image/png'));
    };

    generatePreview();
    return () => {
      cancelled = true;
    };
  }, [open, doc, selection, effectiveOptions]);

  if (!open) return null;

  const handleDownload = async () => {
    setIsExporting(true);
    const ok =
      effectiveOptions.format === 'svg'
        ? await downloadDiagramAsSvg(doc, effectiveOptions, selection)
        : await downloadDiagramAsPng(doc, effectiveOptions, selection);
    setIsExporting(false);
    if (ok) {
      onNotify(
        effectiveOptions.format === 'svg' ? 'File SVG berhasil diunduh.' : 'Gambar PNG berhasil diunduh.'
      );
      onClose();
    } else {
      onNotify('Gagal mengekspor diagram.', 'error');
    }
  };

  const handleCopyPng = async () => {
    setIsExporting(true);
    const res = await copyDiagramPngToClipboard(doc, effectiveOptions, selection);
    setIsExporting(false);
    if (res.ok) {
      onNotify('Gambar PNG disalin ke clipboard.');
      onClose();
    } else {
      onNotify(res.error, 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Export Diagram</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Unduh PNG resolusi tinggi, SVG vektor siap edit, atau salin langsung ke clipboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog export"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview Stage */}
        <div
          className="p-6 border-b border-slate-200 flex items-center justify-center min-h-[220px] max-h-[320px] overflow-hidden"
          style={
            effectiveOptions.background === 'transparent'
              ? {
                  backgroundColor: '#f1f5f9',
                  backgroundImage:
                    'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                }
              : { backgroundColor: '#f8fafc' }
          }
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`Pratinjau ${effectiveOptions.format.toUpperCase()} ${doc.title}`}
              className="max-h-[260px] max-w-full object-contain rounded-lg border border-slate-200 shadow-xs"
            />
          ) : (
            <div className="text-xs text-slate-500">Menyiapkan pratinjau...</div>
          )}
        </div>

        {/* Export Controls */}
        <div className="p-6 space-y-4 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-700">Format</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['png', 'svg'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setOptions((prev) => ({ ...prev, format: fmt }))}
                    className={`py-1.5 text-xs font-semibold uppercase rounded-md transition-colors cursor-pointer ${
                      options.format === fmt
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-700">Latar Belakang</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['white', 'transparent'] as const).map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => setOptions((prev) => ({ ...prev, background: bg }))}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      options.background === bg
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {bg === 'white' ? 'Putih' : 'Transparan'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-700">Skala PNG</span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {([1, 2, 3] as const).map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    disabled={options.format === 'svg'}
                    onClick={() => setOptions((prev) => ({ ...prev, scale }))}
                    className={`py-1.5 text-xs font-medium font-mono tabular-nums rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      options.scale === scale
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {scale}x
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-700">Padding</span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {[24, 40, 64].map((pad) => (
                  <button
                    key={pad}
                    type="button"
                    onClick={() => setOptions((prev) => ({ ...prev, padding: pad }))}
                    className={`py-1.5 text-xs font-medium font-mono tabular-nums rounded-md transition-colors cursor-pointer ${
                      options.padding === pad
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {pad}px
                  </button>
                ))}
              </div>
            </div>
          </div>

          {hasSelection && (
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={options.selectionOnly}
                onChange={(e) => setOptions((prev) => ({ ...prev, selectionOnly: e.target.checked }))}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Ekspor hanya {selection.length} elemen terpilih</span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {dimensions ? `Output: ${dimensions.w} × ${dimensions.h} px` : 'Menghitung dimensi...'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleCopyPng}
              disabled={isExporting || !previewUrl}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin PNG</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isExporting || !previewUrl}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {isExporting
                  ? 'Memproses...'
                  : effectiveOptions.format === 'svg'
                    ? 'Unduh SVG'
                    : 'Unduh PNG'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
