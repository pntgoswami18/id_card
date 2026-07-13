import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdbTable, isIdbAvailable } from './idbStore';
import { ALL_STORE_NAMES, STORE_NAMES } from './idbSchema';

async function clearAllStores() {
  await Promise.all(ALL_STORE_NAMES.map((name) => createIdbTable(name).clear()));
}

beforeEach(async () => {
  await clearAllStores();
});

describe('createIdbTable', () => {
  it('resolves true from isIdbAvailable when IndexedDB is present', async () => {
    expect(await isIdbAvailable()).toBe(true);
  });

  it('returns null from get for a missing key', async () => {
    const table = createIdbTable<{ n: number }>(STORE_NAMES.meta);
    expect(await table.get('missing')).toBeNull();
  });

  it('round-trips a value through put/get', async () => {
    const table = createIdbTable<{ name: string }>(STORE_NAMES.meta);
    expect(await table.put('key1', { name: 'a' })).toBe(true);
    expect(await table.get('key1')).toEqual({ name: 'a' });
  });

  it('put overwrites an existing key', async () => {
    const table = createIdbTable<{ n: number }>(STORE_NAMES.meta);
    await table.put('k', { n: 1 });
    await table.put('k', { n: 2 });
    expect(await table.get('k')).toEqual({ n: 2 });
  });

  it('getAll and getAllKeys return every stored entry', async () => {
    const table = createIdbTable<{ n: number }>(STORE_NAMES.workspaceData);
    await table.put('a', { n: 1 });
    await table.put('b', { n: 2 });
    const all = await table.getAll();
    expect(all).toHaveLength(2);
    expect(all).toEqual(expect.arrayContaining([{ n: 1 }, { n: 2 }]));
    const keys = await table.getAllKeys();
    expect([...keys].sort()).toEqual(['a', 'b']);
  });

  it('putMany writes every entry in a single transaction', async () => {
    const table = createIdbTable<{ n: number }>(STORE_NAMES.printPresets);
    expect(await table.putMany([
      { key: 'p1', value: { n: 1 } },
      { key: 'p2', value: { n: 2 } },
    ])).toBe(true);
    expect(await table.getAll()).toHaveLength(2);
  });

  it('putMany with an empty array is a no-op success without opening a transaction', async () => {
    const table = createIdbTable<{ n: number }>(STORE_NAMES.printPresets);
    expect(await table.putMany([])).toBe(true);
    expect(await table.getAll()).toEqual([]);
  });

  it('delete removes a single key and leaves others intact', async () => {
    const table = createIdbTable<{ n: number }>(STORE_NAMES.userTemplates);
    await table.put('x', { n: 1 });
    await table.put('y', { n: 2 });
    expect(await table.delete('x')).toBe(true);
    expect(await table.get('x')).toBeNull();
    expect(await table.get('y')).toEqual({ n: 2 });
  });

  it('clear empties the store', async () => {
    const table = createIdbTable<{ n: number }>(STORE_NAMES.userTemplates);
    await table.put('a', { n: 1 });
    await table.put('b', { n: 2 });
    expect(await table.clear()).toBe(true);
    expect(await table.getAll()).toEqual([]);
  });

  it('tables for different stores do not see each other\'s data', async () => {
    const templates = createIdbTable<{ n: number }>(STORE_NAMES.userTemplates);
    const presets = createIdbTable<{ n: number }>(STORE_NAMES.printPresets);
    await templates.put('shared-key', { n: 1 });
    expect(await presets.get('shared-key')).toBeNull();
  });
});

describe('createIdbTable when IndexedDB is unavailable', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('resolves every operation to its safe default instead of throwing', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    // @ts-expect-error simulate an environment without IndexedDB (private browsing, disabled, etc.)
    delete globalThis.indexedDB;
    vi.resetModules();
    try {
      const { createIdbTable: freshCreateIdbTable, isIdbAvailable: freshIsIdbAvailable } = await import('./idbStore');
      const { STORE_NAMES: freshStoreNames } = await import('./idbSchema');

      expect(await freshIsIdbAvailable()).toBe(false);

      const table = freshCreateIdbTable<{ n: number }>(freshStoreNames.meta);
      expect(await table.get('k')).toBeNull();
      expect(await table.getAll()).toEqual([]);
      expect(await table.getAllKeys()).toEqual([]);
      expect(await table.put('k', { n: 1 })).toBe(false);
      expect(await table.putMany([{ key: 'k', value: { n: 1 } }])).toBe(false);
      expect(await table.delete('k')).toBe(false);
      expect(await table.clear()).toBe(false);
    } finally {
      globalThis.indexedDB = originalIndexedDB;
    }
  });
});
