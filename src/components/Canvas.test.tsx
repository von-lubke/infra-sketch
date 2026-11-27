// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagramDocument } from '../types/diagram';
import { Canvas } from './Canvas';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeDoc(withNode = true): DiagramDocument {
  return {
    version: 2,
    title: 'Test Diagram',
    updatedAt: '2026-11-27T00:00:00.000Z',
    groups: [],
    nodes: withNode
      ? [
          {
            id: 'node-1',
            type: 'compute',
            provider: 'aws',
            label: 'EC2',
            sublabel: 't3.micro',
            iconKey: 'server',
            x: 100,
            y: 100,
            width: 170,
            height: 70,
            colorTheme: 'indigo',
            seed: 1,
          },
        ]
      : [],
    texts: [],
    edges: [],
  };
}

describe('Canvas reset confirmation popover', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const renderCanvas = (doc = makeDoc(true), onClearCanvas = vi.fn()) => {
    const canvasRef = React.createRef<HTMLDivElement>();
    act(() => {
      root.render(
        <Canvas
          doc={doc}
          viewport={{ panX: 0, panY: 0, zoom: 1 }}
          onViewportChange={vi.fn()}
          toolMode="select"
          onToolModeChange={vi.fn()}
          selection={[]}
          onSelectionChange={vi.fn()}
          snapToGrid={true}
          onToggleSnapToGrid={vi.fn()}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onQuickAddVpc={vi.fn()}
          onCreateTextAt={vi.fn(() => 'text-1')}
          onDropCatalogItem={vi.fn()}
          onTransientDocument={vi.fn()}
          onCommitDragMove={vi.fn()}
          onCommitDocument={vi.fn()}
          onRevertTransient={vi.fn()}
          onDuplicateForDrag={vi.fn(() => ({ nextDoc: doc, clonedSelection: [] }))}
          onUpdateNodeLabel={vi.fn()}
          onUpdateGroupLabel={vi.fn()}
          onUpdateEdgeLabel={vi.fn()}
          onUpdateTextContent={vi.fn()}
          onCreateEdge={vi.fn()}
          onReconnectEdge={vi.fn()}
          onDeleteSelected={vi.fn()}
          onClearCanvas={onClearCanvas}
          onFitToView={vi.fn()}
          onLoadStarterTemplate={vi.fn()}
          onOpenShortcutHelp={vi.fn()}
          onOpenContextMenu={vi.fn()}
          canvasContainerRef={canvasRef}
        />
      );
    });
    return { onClearCanvas };
  };

  it('renders the reset confirmation dialog outside the overflow-x-auto toolbar pill so it is never clipped', () => {
    renderCanvas();

    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Reset'
    ) as HTMLButtonElement | undefined;
    expect(resetBtn).toBeDefined();
    expect(resetBtn?.disabled).toBe(false);

    act(() => {
      resetBtn?.click();
    });

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Hapus semua komponen dan konektor di kanvas ini?');

    // Verify Reset button lives in the scrollable pill while the dialog is outside it
    const scrollPill = resetBtn?.parentElement;
    expect(scrollPill?.className).toContain('overflow-x-auto');
    expect(scrollPill?.contains(dialog)).toBe(false);
    expect(dialog?.parentElement).toBe(scrollPill?.parentElement);
    expect(dialog?.parentElement?.className).not.toContain('overflow-x-auto');
    expect(dialog?.parentElement?.className).not.toContain('overflow-hidden');
  });

  it('handles Batal, Ya Reset, outside click, toggle click, Escape, and empty canvas state', () => {
    const onClearCanvas = vi.fn();
    renderCanvas(makeDoc(true), onClearCanvas);

    const getResetBtn = () =>
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Reset'
      ) as HTMLButtonElement;

    // Open and cancel with Batal
    act(() => {
      getResetBtn().click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Batal'
    ) as HTMLButtonElement;
    act(() => {
      cancelBtn.click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onClearCanvas).not.toHaveBeenCalled();

    // Open and close via outside mousedown
    act(() => {
      getResetBtn().click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    // Open and close via Escape
    act(() => {
      getResetBtn().click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    // Open and toggle closed by clicking Reset again
    act(() => {
      getResetBtn().click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => {
      getResetBtn().click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    // Open and confirm Ya, Reset
    act(() => {
      getResetBtn().click();
    });
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Ya, Reset'
    ) as HTMLButtonElement;
    act(() => {
      confirmBtn.click();
    });
    expect(onClearCanvas).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    // Empty canvas disables Reset and closes dialog if open
    act(() => {
      getResetBtn().click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    renderCanvas(makeDoc(false), onClearCanvas);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(getResetBtn().disabled).toBe(true);
  });

  it('aligns popover under Reset button and clamps within toolbar wrapper width', () => {
    renderCanvas();

    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Reset'
    ) as HTMLButtonElement;
    const wrapper = resetBtn.parentElement?.parentElement as HTMLElement;

    wrapper.getBoundingClientRect = () =>
      ({ left: 100, right: 700, top: 72, bottom: 114, width: 600, height: 42 } as DOMRect);
    resetBtn.getBoundingClientRect = () =>
      ({ left: 610, right: 660, top: 78, bottom: 108, width: 50, height: 30 } as DOMRect);

    act(() => {
      resetBtn.click();
    });

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    // right-aligned to Reset: (660 - 100) - 224 = 336px
    expect(dialog.style.left).toBe('336px');

    // Narrow viewport clamping: Reset near left edge after horizontal scroll
    wrapper.getBoundingClientRect = () =>
      ({ left: 20, right: 320, top: 72, bottom: 114, width: 300, height: 42 } as DOMRect);
    resetBtn.getBoundingClientRect = () =>
      ({ left: 30, right: 80, top: 78, bottom: 108, width: 50, height: 30 } as DOMRect);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    // (80 - 20) - 224 = -164, clamped to 0px
    expect(dialog.style.left).toBe('0px');
  });
});
