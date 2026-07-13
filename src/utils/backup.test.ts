import { beforeEach, describe, expect, it } from 'vitest';
import { createBackup, isBackupData, restoreFromBackup, type BackupData } from './backup';
import { createWorkspace, createSubWorkspace, getDefaultWorkspaceData, getWorkspaceData, getWorkspaceList, saveWorkspaceData } from './workspaceStorage';
import { loadUserTemplates, saveUserTemplate } from './userTemplates';
import { loadPrintPresets, savePrintPreset } from './printPresets';
import { clearAllStores } from './testHelpers';

beforeEach(async () => {
  await clearAllStores();
});

function makeBackup(overrides: Partial<BackupData> = {}): BackupData {
  return {
    version: 1,
    exportedAt: '2024-01-01T00:00:00.000Z',
    app: 'id_card_generator',
    workspaceList: { currentId: '', workspaces: [] },
    workspaceData: {},
    userTemplates: [],
    printPresets: [],
    ...overrides,
  };
}

describe('isBackupData', () => {
  it('accepts a well-formed backup', () => {
    expect(isBackupData(makeBackup())).toBe(true);
  });

  it.each([
    ['not an object', 'a string'],
    ['null', null],
    ['wrong version', { ...makeBackup(), version: 2 }],
    ['wrong app id', { ...makeBackup(), app: 'other_app' }],
    ['userTemplates not an array', { ...makeBackup(), userTemplates: {} }],
    ['printPresets not an array', { ...makeBackup(), printPresets: {} }],
  ])('rejects %s', (_label, value) => {
    expect(isBackupData(value)).toBe(false);
  });
});

describe('createBackup / restoreFromBackup round-trip', () => {
  it('captures a root + sub workspace tree, user templates, and print presets, and restores them after a full wipe', async () => {
    const root = await createWorkspace('Root');
    await saveWorkspaceData(root.id, { ...getDefaultWorkspaceData(), records: [{ name: 'Alice' }, { name: 'Bob' }] });
    const sub = await createSubWorkspace('Sub', root.id);
    await saveWorkspaceData(sub.id, { ...getDefaultWorkspaceData(), records: [{ name: 'Carol' }] });

    await saveUserTemplate({ id: 'ut1', name: 'Badge', elements: [], background: null, watermark: null });
    await savePrintPreset({ id: 'pp1', name: 'A4 Landscape', widthMm: 85.6, heightMm: 53.98, orientation: 'landscape' });

    const backup = await createBackup();
    expect(backup.workspaceList.workspaces.map((w) => w.id).sort()).toEqual([root.id, sub.id].sort());

    // Simulate moving to a fresh browser profile.
    await clearAllStores();
    expect((await getWorkspaceList()).workspaces).toEqual([]);

    const result = await restoreFromBackup(backup);
    expect(result).toEqual({ ok: true });

    const list = await getWorkspaceList();
    expect(list.workspaces.map((w) => w.id).sort()).toEqual([root.id, sub.id].sort());
    expect((await getWorkspaceData(root.id))?.records).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
    expect((await getWorkspaceData(sub.id))?.records).toEqual([{ name: 'Carol' }]);
    expect((await loadUserTemplates()).map((t) => t.meta.id)).toEqual(['ut1']);
    expect((await loadPrintPresets()).map((p) => p.id)).toEqual(['pp1']);
  });

  it('rejects an invalid backup without touching existing data', async () => {
    const meta = await createWorkspace('Existing');
    const result = await restoreFromBackup({ not: 'a backup' } as unknown as BackupData);
    expect(result).toEqual({ ok: false, error: 'Invalid backup file format.' });
    // Nothing was touched.
    expect((await getWorkspaceList()).workspaces.map((w) => w.id)).toEqual([meta.id]);
  });

  it('skips workspaceData entries whose id is not present in the workspace list', async () => {
    const backup = makeBackup({
      workspaceList: { currentId: 'known', workspaces: [{ id: 'known', name: 'Known' }] },
      workspaceData: {
        known: { ...getDefaultWorkspaceData(), records: [{ name: 'Real' }] },
        ghost: getDefaultWorkspaceData(),
      },
    });

    const result = await restoreFromBackup(backup);
    expect(result).toEqual({ ok: true });
    expect((await getWorkspaceData('known'))?.records).toEqual([{ name: 'Real' }]);
    expect(await getWorkspaceData('ghost')).toBeNull();
  });

  it('skips malformed workspaceData entries (missing template or non-array records) without failing', async () => {
    const backup = makeBackup({
      workspaceList: {
        currentId: 'good',
        workspaces: [
          { id: 'good', name: 'Good' },
          { id: 'noTemplate', name: 'No Template' },
          { id: 'badRecords', name: 'Bad Records' },
        ],
      },
      workspaceData: {
        good: { ...getDefaultWorkspaceData(), records: [{ name: 'Real' }] },
        // Malformed payloads that pass the id check but fail the shape guard.
        noTemplate: { ...getDefaultWorkspaceData(), template: undefined } as unknown as ReturnType<typeof getDefaultWorkspaceData>,
        badRecords: { ...getDefaultWorkspaceData(), records: 'nope' } as unknown as ReturnType<typeof getDefaultWorkspaceData>,
      },
    });

    const result = await restoreFromBackup(backup);
    expect(result).toEqual({ ok: true });
    expect((await getWorkspaceData('good'))?.records).toEqual([{ name: 'Real' }]);
    // Guarded out — neither malformed row was written.
    expect(await getWorkspaceData('noTemplate')).toBeNull();
    expect(await getWorkspaceData('badRecords')).toBeNull();
  });

  it('falls back currentId to the first workspace when the backup points at an unknown current id', async () => {
    const backup = makeBackup({
      workspaceList: {
        currentId: 'missing',
        workspaces: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      },
    });
    await restoreFromBackup(backup);
    expect((await getWorkspaceList()).currentId).toBe('a');
  });

  it('clears currentId when the backup has no workspaces at all', async () => {
    const backup = makeBackup({ workspaceList: { currentId: 'missing', workspaces: [] } });
    await restoreFromBackup(backup);
    expect((await getWorkspaceList()).currentId).toBe('');
  });
});
