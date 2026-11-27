// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogSidebar } from './CatalogSidebar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not implement PointerEvent; polyfill from MouseEvent for pointer drag tests
class MockPointerEvent extends MouseEvent {
  pointerType: string;
  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerType = params.pointerType ?? 'mouse';
  }
}

if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent =
    MockPointerEvent as unknown as typeof PointerEvent;
}

describe('CatalogSidebar', () => {
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

  const renderSidebar = (collapsed = false) => {
    act(() => {
      root.render(
        <CatalogSidebar
          collapsed={collapsed}
          onToggleCollapse={vi.fn()}
          onQuickAddNode={vi.fn()}
          onQuickAddGroup={vi.fn()}
          onQuickAddText={vi.fn()}
        />
      );
    });
  };

  it('renders all 6 provider tabs in a single horizontally scrollable row', () => {
    renderSidebar();

    const tablist = container.querySelector('[role="tablist"]') as HTMLElement | null;
    expect(tablist).not.toBeNull();
    expect(tablist?.className).toContain('flex-nowrap');
    expect(tablist?.className).toContain('overflow-x-auto');
    expect(tablist?.className).toContain('scrollbar-none');
    expect(tablist?.className).not.toContain('grid-cols-3');

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual(['Semua', 'Generik', 'AWS', 'GCP', 'Azure', 'K8s']);
    for (const tab of tabs) {
      expect(tab.className).toContain('shrink-0');
      expect(tab.className).toContain('whitespace-nowrap');
    }
  });

  it('shows overflow chevron controls and scrolls via arrows, wheel, and mouse drag without accidental tab switch', () => {
    renderSidebar();

    const tablist = container.querySelector('[role="tablist"]') as HTMLElement;
    let scrollLeftValue = 0;
    Object.defineProperty(tablist, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(tablist, 'scrollWidth', { configurable: true, value: 340 });
    Object.defineProperty(tablist, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeftValue,
      set: (v: number) => {
        scrollLeftValue = Math.max(0, Math.min(140, v));
      },
    });
    tablist.scrollBy = vi.fn((opts?: ScrollToOptions) => {
      if (opts?.left !== undefined) {
        tablist.scrollLeft = scrollLeftValue + opts.left;
        tablist.dispatchEvent(new Event('scroll'));
      }
    }) as unknown as typeof tablist.scrollBy;

    // Trigger resize so indicators evaluate mocked overflow dimensions
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(container.querySelector('button[aria-label="Geser tab ke kiri"]')).toBeNull();
    const rightBtn = container.querySelector('button[aria-label="Geser tab ke kanan"]') as HTMLButtonElement | null;
    expect(rightBtn).not.toBeNull();

    // Clicking right arrow scrolls forward and reveals left arrow
    act(() => {
      rightBtn?.click();
    });
    expect(scrollLeftValue).toBe(110);
    expect(container.querySelector('button[aria-label="Geser tab ke kiri"]')).not.toBeNull();

    // Vertical wheel translates to horizontal scroll
    act(() => {
      tablist.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, deltaX: 0, bubbles: true, cancelable: true }));
    });
    expect(scrollLeftValue).toBe(70);

    // Dragging mouse across a tab pans horizontally and suppresses click on pointer release
    const awsTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (t) => t.textContent === 'AWS'
    ) as HTMLButtonElement;
    expect(awsTab.getAttribute('aria-selected')).toBe('false');

    act(() => {
      awsTab.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 150, pointerType: 'mouse' })
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 110, pointerType: 'mouse' })
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: 110, pointerType: 'mouse' })
      );
      // Simulated click fired right after pointerup on the tab
      awsTab.click();
    });

    expect(scrollLeftValue).toBe(110);
    // Active tab must remain 'Semua' after a drag gesture
    const semuaTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (t) => t.textContent === 'Semua'
    ) as HTMLButtonElement;
    expect(semuaTab.getAttribute('aria-selected')).toBe('true');
    expect(awsTab.getAttribute('aria-selected')).toBe('false');

    // Normal click without drag switches active tab
    act(() => {
      awsTab.click();
    });
    expect(awsTab.getAttribute('aria-selected')).toBe('true');
  });
});
