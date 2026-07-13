import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteUserTemplate,
  loadResolvedUserTemplates,
  loadUserTemplates,
  restoreUserTemplates,
  saveUserTemplate,
} from './userTemplates';
import { clearAllStores } from './testHelpers';

beforeEach(async () => {
  await clearAllStores();
});

const template = (id: string, name: string) => ({ id, name, elements: [], background: null, watermark: null });

describe('loadUserTemplates', () => {
  it('is empty before anything is saved', async () => {
    expect(await loadUserTemplates()).toEqual([]);
  });
});

describe('saveUserTemplate', () => {
  it('persists a template keyed by its own id, with generated meta', async () => {
    expect(await saveUserTemplate(template('user-1', 'Badge'))).toBe(true);
    const all = await loadUserTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].meta.id).toBe('user-1');
    expect(all[0].meta.name).toBe('Badge');
    expect(typeof all[0].meta.savedAt).toBe('string');
    expect(all[0].template).toEqual(template('user-1', 'Badge'));
  });

  it('upserts when saving the same template id again', async () => {
    await saveUserTemplate(template('user-1', 'Badge v1'));
    await saveUserTemplate(template('user-1', 'Badge v2'));
    const all = await loadUserTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].meta.name).toBe('Badge v2');
  });

  it('keeps templates with different ids independent', async () => {
    await saveUserTemplate(template('user-1', 'A'));
    await saveUserTemplate(template('user-2', 'B'));
    const all = await loadUserTemplates();
    expect(all.map((e) => e.meta.id).sort()).toEqual(['user-1', 'user-2']);
  });
});

describe('loadResolvedUserTemplates', () => {
  it('returns the same set of templates with assets resolved (no-op when nothing was externalized)', async () => {
    await saveUserTemplate(template('user-1', 'Badge'));
    const resolved = await loadResolvedUserTemplates();
    expect(resolved).toEqual([
      expect.objectContaining({ meta: expect.objectContaining({ id: 'user-1' }), template: template('user-1', 'Badge') }),
    ]);
  });
});

describe('deleteUserTemplate', () => {
  it('removes a single template, leaving others intact', async () => {
    await saveUserTemplate(template('user-1', 'A'));
    await saveUserTemplate(template('user-2', 'B'));
    expect(await deleteUserTemplate('user-1')).toBe(true);
    const all = await loadUserTemplates();
    expect(all.map((e) => e.meta.id)).toEqual(['user-2']);
  });
});

describe('restoreUserTemplates', () => {
  it('replaces the whole stored set (backup restore)', async () => {
    await saveUserTemplate(template('stale', 'Stale'));

    const ok = await restoreUserTemplates([
      { meta: { id: 'r1', name: 'Restored 1', savedAt: '2024-01-01T00:00:00.000Z' }, template: template('r1', 'Restored 1') },
      { meta: { id: 'r2', name: 'Restored 2', savedAt: '2024-01-02T00:00:00.000Z' }, template: template('r2', 'Restored 2') },
    ]);
    expect(ok).toBe(true);

    const all = await loadUserTemplates();
    expect(all.map((e) => e.meta.id).sort()).toEqual(['r1', 'r2']);
    // The stale pre-existing template is gone — restore replaces, not merges.
    expect(all.some((e) => e.meta.id === 'stale')).toBe(false);
    // Original savedAt metadata is preserved, not regenerated.
    expect(all.find((e) => e.meta.id === 'r1')?.meta.savedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('restoring an empty list clears the store', async () => {
    await saveUserTemplate(template('user-1', 'A'));
    await restoreUserTemplates([]);
    expect(await loadUserTemplates()).toEqual([]);
  });
});
