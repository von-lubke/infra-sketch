import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { DiagramDocument, PngExportOptions } from '../types/diagram';
import { downloadDiagramAsPng, renderDiagramToCanvas } from '../utils/exportImport';

interface ExportPngModalProps {
  open: boolean;
  doc: DiagramDocument;
  onClose: () => void;
  onExportSuccess: () => void;
}

export function ExportPngModal({ open, doc, onClose, onExportSuccess }: ExportPngModalProps) {
  const [options, setOptions] = useState<PngExportOptions>({
    background: 'white',
    scale: 2,
    padding: 40,
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const generatePreview = async () => {
      const rendered = await renderDiagramToCanvas(doc, options);
      if (cancelled || !rendered) return;
      setDimensions({
        w: rendered.width * options.scale,
        h: rendered.height * options.scale,
      });
      setPreviewUrl(rendered.canvas.toDataURL('image/png'));
    };

    generatePreview();
    return () => {
      cancelled = true;
    };
  }, [open, doc, options]);

  if (!open) return null;

  const handleDownload = async () => {
    setIsExporting(true);
    const ok = await downloadDiagramAsPng(doc, options);
    setIsExporting(false);
    if (ok) {
      onExportSuccess();
      onClose();
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
            <h2 className="text-base font-semibold text-slate-900">Export ke PNG</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Resolusi tajam dengan potongan otomatis di sekitar diagram.
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
          className="p-6 border-b border-slate-200 flex items-center justify-center min-h-[240px] max-h-[340px] overflow-hidden"
          style={
            options.background === 'transparent'
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
              alt={`Pratinjau PNG ${doc.title}`}
              className="max-h-[280px] max-w-full object-contain rounded-lg border border-slate-200 shadow-xs"
            />
          ) : (
            <div className="text-xs text-slate-500">Menyiapkan pratinjau...</div>
          )}
        </div>

        {/* Export Controls */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white">
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
            <span className="block text-xs font-medium text-slate-700">Skala Resolusi</span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
              {([1, 2, 3] as const).map((scale) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => setOptions((prev) => ({ ...prev, scale }))}
                  className={`py-1.5 text-xs font-medium font-mono tabular-nums rounded-md transition-colors cursor-pointer ${
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

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {dimensions ? `Output: ${dimensions.w} × ${dimensions.h} px` : 'Menghitung dimensi...'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isExporting || !previewUrl}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Mengunduh...' : 'Unduh PNG'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
