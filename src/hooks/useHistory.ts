import { useCallback, useReducer } from 'react';
import { DiagramDocument } from '../types/diagram';

export const MAX_HISTORY = 40;
export const COALESCE_WINDOW_MS = 1200;

export interface HistoryState {
  past: DiagramDocument[];
  present: DiagramDocument;
  future: DiagramDocument[];
  lastCoalesceKey: string | null;
  lastCoalesceAt: number;
}

export type HistoryAction =
  | {
      type: 'set';
      updater: (prev: DiagramDocument) => DiagramDocument;
      coalesceKey?: string;
      now?: number;
    }
  | {
      type: 'transient';
      updater: (prev: DiagramDocument) => DiagramDocument;
    }
  | {
      type: 'commit';
      before: DiagramDocument;
    }
  | {
      type: 'revertTransient';
      before: DiagramDocument;
    }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace'; doc: DiagramDocument };

/**
 * Compares document structure excluding `updatedAt` so no-op edits never push
 * empty entries onto the undo stack.
 */
export function isDocumentContentEqual(a: DiagramDocument, b: DiagramDocument): boolean {
  if (a === b) return true;
  if (
    a.title !== b.title ||
    a.version !== b.version ||
    a.groups.length !== b.groups.length ||
    a.nodes.length !== b.nodes.length ||
    a.texts.length !== b.texts.length ||
    a.edges.length !== b.edges.length
  ) {
    return false;
  }
  return (
    JSON.stringify({
      title: a.title,
      groups: a.groups,
      nodes: a.nodes,
      texts: a.texts,
      edges: a.edges,
    }) ===
    JSON.stringify({
      title: b.title,
      groups: b.groups,
      nodes: b.nodes,
      texts: b.texts,
      edges: b.edges,
    })
  );
}

export function createInitialHistoryState(initialDoc: DiagramDocument): HistoryState {
  return {
    past: [],
    present: initialDoc,
    future: [],
    lastCoalesceKey: null,
    lastCoalesceAt: 0,
  };
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'set': {
      const nextRaw = action.updater(state.present);
      if (isDocumentContentEqual(state.present, nextRaw)) {
        return state;
      }

      const now = action.now ?? Date.now();
      const nextDoc: DiagramDocument = {
        ...nextRaw,
        updatedAt: new Date(now).toISOString(),
      };

      const canCoalesce =
        Boolean(action.coalesceKey) &&
        action.coalesceKey === state.lastCoalesceKey &&
        now - state.lastCoalesceAt <= COALESCE_WINDOW_MS &&
        state.past.length > 0;

      if (canCoalesce) {
        return {
          ...state,
          present: nextDoc,
          future: [],
          lastCoalesceAt: now,
        };
      }

      return {
        past: [...state.past.slice(-(MAX_HISTORY - 1)), state.present],
        present: nextDoc,
        future: [],
        lastCoalesceKey: action.coalesceKey ?? null,
        lastCoalesceAt: now,
      };
    }

    case 'transient': {
      const nextRaw = action.updater(state.present);
      if (nextRaw === state.present) return state;
      return {
        ...state,
        present: nextRaw,
      };
    }

    case 'commit': {
      if (isDocumentContentEqual(action.before, state.present)) {
        return state;
      }
      return {
        past: [...state.past.slice(-(MAX_HISTORY - 1)), action.before],
        present: {
          ...state.present,
          updatedAt: new Date().toISOString(),
        },
        future: [],
        lastCoalesceKey: null,
        lastCoalesceAt: 0,
      };
    }

    case 'revertTransient': {
      return {
        ...state,
        present: action.before,
      };
    }

    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future.slice(0, MAX_HISTORY - 1)],
        lastCoalesceKey: null,
        lastCoalesceAt: 0,
      };
    }

    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past.slice(-(MAX_HISTORY - 1)), state.present],
        present: next,
        future: state.future.slice(1),
        lastCoalesceKey: null,
        lastCoalesceAt: 0,
      };
    }

    case 'replace': {
      return createInitialHistoryState(action.doc);
    }
  }
}

export function useHistory(initialDocFactory: () => DiagramDocument) {
  const [state, dispatch] = useReducer(
    historyReducer,
    undefined,
    () => createInitialHistoryState(initialDocFactory())
  );

  const setDocument = useCallback(
    (updater: (prev: DiagramDocument) => DiagramDocument, coalesceKey?: string) => {
      dispatch({ type: 'set', updater, coalesceKey });
    },
    []
  );

  const setTransient = useCallback((updater: (prev: DiagramDocument) => DiagramDocument) => {
    dispatch({ type: 'transient', updater });
  }, []);

  const commitBefore = useCallback((before: DiagramDocument) => {
    dispatch({ type: 'commit', before });
  }, []);

  const revertTransient = useCallback((before: DiagramDocument) => {
    dispatch({ type: 'revertTransient', before });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'undo' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'redo' });
  }, []);

  return {
    doc: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    setDocument,
    setTransient,
    commitBefore,
    revertTransient,
    undo,
    redo,
  };
}
