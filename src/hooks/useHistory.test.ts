import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_TEMPLATES } from '../data/templates';
import {
  COALESCE_WINDOW_MS,
  createInitialHistoryState,
  historyReducer,
  MAX_HISTORY,
} from './useHistory';

describe('historyReducer', () => {
  it('coalesces consecutive edits with the same key inside window', () => {
    const initial = createInitialHistoryState(ARCHITECTURE_TEMPLATES[0].build());
    const targetId = initial.present.nodes[0].id;
    let state = initial;

    state = historyReducer(state, {
      type: 'set',
      coalesceKey: `node:${targetId}:label`,
      now: 1000,
      updater: (doc) => ({
        ...doc,
        nodes: doc.nodes.map((n) => (n.id === targetId ? { ...n, label: 'A' } : n)),
      }),
    });
    state = historyReducer(state, {
      type: 'set',
      coalesceKey: `node:${targetId}:label`,
      now: 1000 + COALESCE_WINDOW_MS - 100,
      updater: (doc) => ({
        ...doc,
        nodes: doc.nodes.map((n) => (n.id === targetId ? { ...n, label: 'AB' } : n)),
      }),
    });

    expect(state.past).toHaveLength(1);
    expect(state.present.nodes[0].label).toBe('AB');

    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.present.nodes[0].label).toBe(initial.present.nodes[0].label);
  });

  it('ignores no-op updates without adding empty undo steps', () => {
    const initial = createInitialHistoryState(ARCHITECTURE_TEMPLATES[0].build());
    const next = historyReducer(initial, {
      type: 'set',
      updater: (doc) => ({
        ...doc,
        nodes: doc.nodes.map((n) => ({ ...n })),
      }),
    });
    expect(next).toBe(initial);
    expect(next.past).toHaveLength(0);
  });

  it('supports transient moves committed as a single undoable step and revertTransient', () => {
    const initial = createInitialHistoryState(ARCHITECTURE_TEMPLATES[0].build());
    const before = initial.present;
    const nodeId = before.nodes[0].id;

    let state = historyReducer(initial, {
      type: 'transient',
      updater: (doc) => ({
        ...doc,
        nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, x: 999 } : n)),
      }),
    });
    expect(state.past).toHaveLength(0);
    expect(state.present.nodes[0].x).toBe(999);

    const reverted = historyReducer(state, { type: 'revertTransient', before });
    expect(reverted.present.nodes[0].x).toBe(before.nodes[0].x);
    expect(reverted.past).toHaveLength(0);

    state = historyReducer(state, { type: 'commit', before });
    expect(state.past).toHaveLength(1);

    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.present.nodes[0].x).toBe(before.nodes[0].x);
    const redone = historyReducer(undone, { type: 'redo' });
    expect(redone.present.nodes[0].x).toBe(999);
  });

  it('caps history stack at MAX_HISTORY', () => {
    let state = createInitialHistoryState(ARCHITECTURE_TEMPLATES[0].build());
    for (let i = 0; i < MAX_HISTORY + 10; i++) {
      state = historyReducer(state, {
        type: 'set',
        now: 1000 + i * 5000,
        updater: (doc) => ({ ...doc, title: `Doc ${i}` }),
      });
    }
    expect(state.past).toHaveLength(MAX_HISTORY);
  });
});
