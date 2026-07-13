import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMigrationNoticeIfAny, PURGE_LEGACY_KEYS, runMigrationIfNeeded, readLegacyWorkspaceList, readLegacyWorkspaceData } from './storageMigration';
import { LIST_KEY, DATA_PREFIX } from './workspaceStorage';
import { STORAGE_KEY as USER_TEMPLATES_KEY } from './userTemplates';
import { STORAGE_KEY as PRINT_PRESETS_KEY } from './printPresets';
import { createIdbTable } from './idbStore';
import { ALL_STORE_NAMES, STORE_NAMES } from './idbSchema';

const BEACON_KEY = 'id_card_idb_migration_v1';
const NOTICE_SHOWN_KEY = 'id_card_idb_migration_notice_shown';

async function clearAllStores() {
  await Promise.all(ALL_STORE_NAMES.map((name) => createIdbTable(name).clear()));
}

beforeEach(async () => {
  localStorage.clear();
  await clearAllStores();
});

describe('runMigrationIfNeeded', () => {
  it('fast-paths to complete without writing anything when there is no legacy data', async () => {
    const result = await runMigrationIfNeeded();
    expect(result).toEqual({ ran: false, degraded: false });
    expect(localStorage.getItem(BEACON_KEY)).toBe('complete');
  });

  it('copies workspace list, workspace data, user templates, and print presets into IndexedDB', async () => {
    localStorage.setItem(LIST_KEY, JSON.stringify({ currentId: 'ws1', workspaces: [{ id: 'ws1', name: 'WS1' }] }));
    localStorage.setItem(DATA_PREFIX + 'ws1', JSON.stringify({ template: { id: 't1' }, records: [{ a: 1 }] }));
    localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify([{ meta: { id: 'ut1', name: 'UT1' }, template: { id: 'ut1' } }]));
    localStorage.setItem(PRINT_PRESETS_KEY, JSON.stringify([{ id: 'pp1', name: 'Preset1' }]));

    const result = await runMigrationIfNeeded();
    expect(result).toEqual({ ran: true, degraded: false });

    expect(await createIdbTable(STORE_NAMES.workspaceList).get('current')).toEqual({
      currentId: 'ws1',
      workspaces: [{ id: 'ws1', name: 'WS1' }],
    });
    expect(await createIdbTable(STORE_NAMES.workspaceData).get('ws1')).toEqual({
      template: { id: 't1' },
      records: [{ a: 1 }],
    });
    expect(await createIdbTable(STORE_NAMES.userTemplates).get('ut1')).toEqual({
      meta: { id: 'ut1', name: 'UT1' },
      template: { id: 'ut1' },
    });
    expect(await createIdbTable(STORE_NAMES.printPresets).get('pp1')).toEqual({ id: 'pp1', name: 'Preset1' });

    const status = await createIdbTable<{ status: string; corruptSkipped: string[]; verifyFailed: string[] }>(
      STORE_NAMES.meta,
    ).get('migration_v1');
    expect(status?.status).toBe('complete');
    expect(status?.corruptSkipped).toEqual([]);
    expect(status?.verifyFailed).toEqual([]);
  });

  it('leaves legacy localStorage keys in place (soak-period safety net)', async () => {
    expect(PURGE_LEGACY_KEYS).toBe(false);
    localStorage.setItem(PRINT_PRESETS_KEY, JSON.stringify([{ id: 'pp1', name: 'Preset1' }]));
    await runMigrationIfNeeded();
    expect(localStorage.getItem(PRINT_PRESETS_KEY)).not.toBeNull();
  });

  it('skips corrupt entries instead of failing the whole migration', async () => {
    localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify([
      { meta: { id: 'ut1', name: 'Good' }, template: { id: 'ut1' } },
      { meta: {}, template: null }, // missing meta.id / template -> invalid
      'not-an-object',
    ]));

    const result = await runMigrationIfNeeded();
    expect(result.ran).toBe(true);

    const all = await createIdbTable<{ meta: { id: string } }>(STORE_NAMES.userTemplates).getAll();
    expect(all).toEqual([{ meta: { id: 'ut1', name: 'Good' }, template: { id: 'ut1' } }]);

    const status = await createIdbTable<{ corruptSkipped: string[] }>(STORE_NAMES.meta).get('migration_v1');
    expect(status?.corruptSkipped.length).toBe(2);
  });

  it('treats a malformed workspace list JSON as corrupt rather than throwing', async () => {
    localStorage.setItem(LIST_KEY, 'not valid json {{{');
    const result = await runMigrationIfNeeded();
    expect(result.ran).toBe(true);
    expect(await createIdbTable(STORE_NAMES.workspaceList).get('current')).toBeNull();
    const status = await createIdbTable<{ corruptSkipped: string[] }>(STORE_NAMES.meta).get('migration_v1');
    expect(status?.corruptSkipped).toContain(LIST_KEY);
  });

  it('is idempotent: a second call short-circuits on the beacon and does not reprocess legacy data', async () => {
    localStorage.setItem(PRINT_PRESETS_KEY, JSON.stringify([{ id: 'pp1', name: 'Preset1' }]));
    await runMigrationIfNeeded();

    // Mutate the legacy key after the first migration completed.
    localStorage.setItem(PRINT_PRESETS_KEY, JSON.stringify([{ id: 'pp2', name: 'Preset2' }]));
    const second = await runMigrationIfNeeded();
    expect(second).toEqual({ ran: false, degraded: false });

    const presetsTable = createIdbTable(STORE_NAMES.printPresets);
    expect(await presetsTable.get('pp1')).toEqual({ id: 'pp1', name: 'Preset1' });
    expect(await presetsTable.get('pp2')).toBeNull();
  });

  it('restores the beacon and skips re-copying when IndexedDB already has a complete record', async () => {
    localStorage.setItem(PRINT_PRESETS_KEY, JSON.stringify([{ id: 'pp1', name: 'Preset1' }]));
    await createIdbTable(STORE_NAMES.meta).put('migration_v1', {
      status: 'complete',
      corruptSkipped: [],
      verifyFailed: [],
      completedAt: new Date().toISOString(),
    });
    // Beacon absent (e.g. localStorage was partially cleared) but IDB meta says complete.
    expect(localStorage.getItem(BEACON_KEY)).toBeNull();

    const result = await runMigrationIfNeeded();
    expect(result).toEqual({ ran: false, degraded: false });
    expect(localStorage.getItem(BEACON_KEY)).toBe('complete');
    // Legacy data was never actually copied by this call.
    expect(await createIdbTable(STORE_NAMES.printPresets).get('pp1')).toBeNull();
  });
});

describe('getMigrationNoticeIfAny', () => {
  it('reports zero issues after a clean migration and only checks once', async () => {
    await runMigrationIfNeeded();
    expect(await getMigrationNoticeIfAny()).toEqual({ checked: true, count: 0 });
    // Second call is the cheap fast path — the notice-shown beacon is already set.
    expect(await getMigrationNoticeIfAny()).toEqual({ checked: true, count: 0 });
    expect(localStorage.getItem(NOTICE_SHOWN_KEY)).toBe('shown');
  });

  it('reports the corrupt/verifyFailed count once after a migration with issues', async () => {
    localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(['not-an-object']));
    await runMigrationIfNeeded();
    const notice = await getMigrationNoticeIfAny();
    expect(notice.checked).toBe(true);
    expect(notice.count).toBe(1);
  });
});

describe('legacy read-only fallback (degraded boot path)', () => {
  it('reads the workspace list and per-workspace data straight from localStorage', () => {
    localStorage.setItem(LIST_KEY, JSON.stringify({ currentId: 'ws1', workspaces: [{ id: 'ws1', name: 'WS1' }] }));
    localStorage.setItem(DATA_PREFIX + 'ws1', JSON.stringify({ template: { id: 't1' }, records: [{ a: 1 }] }));

    expect(readLegacyWorkspaceList()).toEqual({ currentId: 'ws1', workspaces: [{ id: 'ws1', name: 'WS1' }] });
    expect(readLegacyWorkspaceData('ws1')).toEqual({ template: { id: 't1' }, records: [{ a: 1 }] });
  });

  it('defaults currentId to the first workspace when the stored list omits it', () => {
    localStorage.setItem(LIST_KEY, JSON.stringify({ currentId: '', workspaces: [{ id: 'ws1', name: 'WS1' }] }));
    expect(readLegacyWorkspaceList()?.currentId).toBe('ws1');
  });

  it('returns null for absent or corrupt legacy data instead of throwing', () => {
    expect(readLegacyWorkspaceList()).toBeNull();
    expect(readLegacyWorkspaceData('nope')).toBeNull();
    localStorage.setItem(LIST_KEY, 'not valid json {{{');
    localStorage.setItem(DATA_PREFIX + 'ws1', '{ bad');
    expect(readLegacyWorkspaceList()).toBeNull();
    expect(readLegacyWorkspaceData('ws1')).toBeNull();
  });
});

describe('degraded mode (IndexedDB unavailable)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('runMigrationIfNeeded reports degraded without throwing', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    // @ts-expect-error simulate an environment without IndexedDB
    delete globalThis.indexedDB;
    vi.resetModules();
    try {
      const mod = await import('./storageMigration');
      expect(await mod.runMigrationIfNeeded()).toEqual({ ran: false, degraded: true });
      expect(await mod.getMigrationNoticeIfAny()).toEqual({ checked: false, count: 0 });
    } finally {
      globalThis.indexedDB = originalIndexedDB;
    }
  });
});
