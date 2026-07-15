import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setStoredHandle,
  getStoredHandle,
  getAllStoredHandles,
  deleteStoredHandle,
} from './fileHandleStore';

// fileHandleStore owns its own IndexedDB database (id_card_file_handles), separate
// from id_card_store, so it isn't covered by the shared clearAllStores() helper.
// Delete every key this suite may have written so tests stay isolated.
beforeEach(async () => {
  for (const id of ['root-a', 'root-b', 'root-c']) {
    await deleteStoredHandle(id);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Only plain-data fields — structured-cloneable, simulating what fake-indexeddb can actually store. */
function cloneableHandle(name: string): { name: string } {
  return { name };
}

/** A handle shaped with a function property — not structured-cloneable (per utils/CLAUDE.md). */
function nonCloneableHandle(name: string) {
  return { name, createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
}

describe('setStoredHandle / getStoredHandle', () => {
  it('returns null for a rootId that was never stored', async () => {
    expect(await getStoredHandle('root-a')).toBeNull();
  });

  it('round-trips a structured-cloneable handle', async () => {
    await setStoredHandle('root-a', cloneableHandle('a.idcard') as never);
    const result = await getStoredHandle('root-a');
    expect(result).toEqual({ name: 'a.idcard' });
  });

  it('put overwrites an existing entry for the same rootId', async () => {
    await setStoredHandle('root-a', cloneableHandle('first.idcard') as never);
    await setStoredHandle('root-a', cloneableHandle('second.idcard') as never);
    expect(await getStoredHandle('root-a')).toEqual({ name: 'second.idcard' });
  });

  // IDBObjectStore.put() throws DataCloneError *synchronously* for a non-cloneable
  // value (spec behavior, not routed through tx.onerror). setStoredHandle wraps the
  // transaction/put() call in a try/catch so this resolves to a safe default instead
  // of throwing, per the module's documented contract (see PR #6).
  it('fails silently (does not throw) when the handle is not structured-cloneable', async () => {
    await expect(setStoredHandle('root-b', nonCloneableHandle('b.idcard'))).resolves.toBeUndefined();
    expect(await getStoredHandle('root-b')).toBeNull();
  });
});

describe('deleteStoredHandle', () => {
  it('removes a stored handle', async () => {
    await setStoredHandle('root-a', cloneableHandle('a.idcard') as never);
    await deleteStoredHandle('root-a');
    expect(await getStoredHandle('root-a')).toBeNull();
  });

  it('is a no-op (does not throw) for a rootId that was never stored', async () => {
    await expect(deleteStoredHandle('never-stored')).resolves.toBeUndefined();
  });
});

describe('getAllStoredHandles', () => {
  it('returns an empty Map when nothing is stored', async () => {
    const all = await getAllStoredHandles();
    expect(all.size).toBe(0);
  });

  it('returns every stored rootId -> handle pair', async () => {
    await setStoredHandle('root-a', cloneableHandle('a.idcard') as never);
    await setStoredHandle('root-b', cloneableHandle('b.idcard') as never);
    const all = await getAllStoredHandles();
    expect(all.size).toBe(2);
    expect(all.get('root-a')).toEqual({ name: 'a.idcard' });
    expect(all.get('root-b')).toEqual({ name: 'b.idcard' });
  });
});

describe('degraded mode (IndexedDB unavailable)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('resolves every operation to its safe default instead of throwing', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    // @ts-expect-error simulate an environment without IndexedDB (private browsing, disabled, etc.)
    delete globalThis.indexedDB;
    vi.resetModules();
    try {
      const fresh = await import('./fileHandleStore');
      await expect(fresh.setStoredHandle('root-a', cloneableHandle('a.idcard') as never)).resolves.toBeUndefined();
      expect(await fresh.getStoredHandle('root-a')).toBeNull();
      expect((await fresh.getAllStoredHandles()).size).toBe(0);
      await expect(fresh.deleteStoredHandle('root-a')).resolves.toBeUndefined();
    } finally {
      globalThis.indexedDB = originalIndexedDB;
    }
  });
});
