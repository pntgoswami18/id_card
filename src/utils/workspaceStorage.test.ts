import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSubWorkspace,
  createWorkspace,
  deleteWorkspaceData,
  deleteWorkspaceTree,
  duplicateWorkspace,
  getChildWorkspaces,
  getDefaultWorkspaceData,
  getEffectiveWorkspaceData,
  getWorkspaceData,
  getWorkspaceList,
  renameWorkspace,
  saveWorkspaceData,
  setCurrentWorkspace,
  updateWorkspaceMeta,
} from './workspaceStorage';
import { createIdbTable } from './idbStore';
import { ALL_STORE_NAMES } from './idbSchema';

async function clearAllStores() {
  await Promise.all(ALL_STORE_NAMES.map((name) => createIdbTable(name).clear()));
}

beforeEach(async () => {
  await clearAllStores();
});

describe('getWorkspaceList — empty fallback', () => {
  it('resolves to an empty list when nothing has been created yet', async () => {
    expect(await getWorkspaceList()).toEqual({ currentId: '', workspaces: [] });
  });
});

describe('createWorkspace / getWorkspaceData / saveWorkspaceData', () => {
  it('creates a workspace, makes it current, and round-trips its data', async () => {
    const meta = await createWorkspace('My Workspace');
    expect(meta.name).toBe('My Workspace');

    const list = await getWorkspaceList();
    expect(list.currentId).toBe(meta.id);
    expect(list.workspaces).toEqual([{ id: meta.id, name: 'My Workspace' }]);

    const data = { ...getDefaultWorkspaceData(), records: [{ name: 'Alice' }] };
    expect(await saveWorkspaceData(meta.id, data)).toBe(true);
    expect(await getWorkspaceData(meta.id)).toEqual(data);
  });

  it('carries an optional logo and keeps the list entry logo in sync on save', async () => {
    const meta = await createWorkspace('Logo WS', 'data:image/png;base64,AAA');
    expect(meta.logo).toBe('data:image/png;base64,AAA');

    await saveWorkspaceData(meta.id, { ...getDefaultWorkspaceData(), logo: 'data:image/png;base64,BBB' });
    const list = await getWorkspaceList();
    expect(list.workspaces[0].logo).toBe('data:image/png;base64,BBB');
  });

  it('returns null for a workspace that was never saved', async () => {
    expect(await getWorkspaceData('nonexistent')).toBeNull();
  });
});

describe('renameWorkspace / updateWorkspaceMeta / setCurrentWorkspace', () => {
  it('renames an existing workspace entry', async () => {
    const meta = await createWorkspace('Old Name');
    await renameWorkspace(meta.id, 'New Name');
    const list = await getWorkspaceList();
    expect(list.workspaces[0].name).toBe('New Name');
  });

  it('is a no-op when the workspace id does not exist', async () => {
    await createWorkspace('Solo');
    await renameWorkspace('missing-id', 'Should Not Appear');
    const list = await getWorkspaceList();
    expect(list.workspaces.map((w) => w.name)).toEqual(['Solo']);
  });

  it('updateWorkspaceMeta patches name/logo without clobbering the other field', async () => {
    const meta = await createWorkspace('Original', 'data:image/png;base64,AAA');
    await updateWorkspaceMeta(meta.id, { name: 'Renamed' });
    let list = await getWorkspaceList();
    expect(list.workspaces[0]).toMatchObject({ name: 'Renamed', logo: 'data:image/png;base64,AAA' });

    await updateWorkspaceMeta(meta.id, { logo: null });
    list = await getWorkspaceList();
    expect(list.workspaces[0].logo).toBeUndefined();
  });

  it('setCurrentWorkspace switches currentId only for a known workspace', async () => {
    const a = await createWorkspace('A');
    const b = await createWorkspace('B');
    // createWorkspace('B') already made B current; explicitly switch back to A.
    await setCurrentWorkspace(a.id);
    expect((await getWorkspaceList()).currentId).toBe(a.id);

    await setCurrentWorkspace('unknown-id');
    // Unknown id is ignored — currentId stays put.
    expect((await getWorkspaceList()).currentId).toBe(a.id);
    void b;
  });
});

describe('sub-workspaces and copy-on-write template inheritance', () => {
  it('createSubWorkspace registers a child under its parent and switches to it', async () => {
    const parent = await createWorkspace('Parent');
    const child = await createSubWorkspace('Child', parent.id);
    expect(child.parentId).toBe(parent.id);

    const list = await getWorkspaceList();
    expect(list.currentId).toBe(child.id);
    expect(await getChildWorkspaces(parent.id)).toEqual([child]);
  });

  it('throws when the parent does not exist', async () => {
    await expect(createSubWorkspace('Orphan', 'missing-parent')).rejects.toThrow(/parent "missing-parent" not found/);
  });

  it('throws when trying to nest a sub-workspace under another sub-workspace', async () => {
    const parent = await createWorkspace('Parent');
    const child = await createSubWorkspace('Child', parent.id);
    await expect(createSubWorkspace('Grandchild', child.id)).rejects.toThrow(/already a child/);
  });

  it('getEffectiveWorkspaceData overlays the parent template while linked', async () => {
    const parent = await createWorkspace('Parent');
    const parentTemplate = { id: 'parent-tpl', name: 'Parent Template', elements: [], background: null, watermark: null };
    await saveWorkspaceData(parent.id, { ...getDefaultWorkspaceData(), template: parentTemplate });

    const child = await createSubWorkspace('Child', parent.id);
    const childOwnTemplate = { id: 'child-fallback', name: 'Child Fallback', elements: [], background: null, watermark: null };
    await saveWorkspaceData(child.id, {
      ...getDefaultWorkspaceData(),
      template: childOwnTemplate,
      templateLinkedToParent: true,
    });

    const effective = await getEffectiveWorkspaceData(child.id);
    expect(effective?.template).toEqual(parentTemplate);
    expect(effective?.templateLinkedToParent).toBe(true);
  });

  it('self-heals to a detached copy when the parent record is missing', async () => {
    const parent = await createWorkspace('Parent');
    const child = await createSubWorkspace('Child', parent.id);
    const childOwnTemplate = { id: 'child-own', name: 'Child Own', elements: [], background: null, watermark: null };
    await saveWorkspaceData(child.id, {
      ...getDefaultWorkspaceData(),
      template: childOwnTemplate,
      templateLinkedToParent: true,
    });

    // The parent's own data row is gone (e.g. corrupted / cleared independently),
    // but its list entry (and the child's parentId reference to it) still exists.
    await deleteWorkspaceData(parent.id);

    const effective = await getEffectiveWorkspaceData(child.id);
    expect(effective?.template).toEqual(childOwnTemplate);
    expect(effective?.templateLinkedToParent).toBe(false);
  });
});

describe('deleteWorkspaceTree', () => {
  it('removes a workspace and all its direct children, and their stored data', async () => {
    // An unrelated sibling stays behind so the list doesn't hit the
    // last-workspace "default" fallback — that's covered by a separate test.
    const sibling = await createWorkspace('Sibling');
    const parent = await createWorkspace('Parent');
    const child = await createSubWorkspace('Child', parent.id);
    await saveWorkspaceData(parent.id, getDefaultWorkspaceData());
    await saveWorkspaceData(child.id, getDefaultWorkspaceData());

    await deleteWorkspaceTree(parent.id);

    const list = await getWorkspaceList();
    expect(list.workspaces).toEqual([{ id: sibling.id, name: 'Sibling' }]);
    expect(await getWorkspaceData(parent.id)).toBeNull();
    expect(await getWorkspaceData(child.id)).toBeNull();
  });

  it('falls back to a synthesized "default" entry when the last workspace is deleted', async () => {
    const only = await createWorkspace('Only');
    await deleteWorkspaceTree(only.id);
    const list = await getWorkspaceList();
    expect(list.workspaces).toEqual([{ id: 'default', name: 'Default' }]);
    expect(list.currentId).toBe('default');
  });

  it('resets currentId to the first remaining workspace when a non-current tree is deleted', async () => {
    const a = await createWorkspace('A');
    const b = await createWorkspace('B');
    await setCurrentWorkspace(a.id);
    await deleteWorkspaceTree(b.id);
    const list = await getWorkspaceList();
    expect(list.workspaces.map((w) => w.id)).toEqual([a.id]);
    expect(list.currentId).toBe(a.id);
  });
});

describe('duplicateWorkspace', () => {
  it('copies data and list entry under a new id, switches current, strips csvData/link flag', async () => {
    const source = await createWorkspace('Source');
    await saveWorkspaceData(source.id, {
      ...getDefaultWorkspaceData(),
      records: [{ name: 'Bob' }],
      csvData: { headers: ['name'], rows: [{ name: 'Bob' }] },
    });

    const dup = await duplicateWorkspace(source.id, 'Source (copy)');
    expect(dup.name).toBe('Source (copy)');
    expect(dup.id).not.toBe(source.id);

    const list = await getWorkspaceList();
    expect(list.currentId).toBe(dup.id);
    expect(list.workspaces.map((w) => w.id)).toEqual([source.id, dup.id]);

    const dupData = await getWorkspaceData(dup.id);
    expect(dupData?.records).toEqual([{ name: 'Bob' }]);
    expect(dupData?.csvData).toBeUndefined();
    expect(dupData?.templateLinkedToParent).toBeUndefined();
  });

  it('duplicates a linked sub-workspace as a detached, independent snapshot', async () => {
    const parent = await createWorkspace('Parent');
    const parentTemplate = { id: 'parent-tpl', name: 'Parent Template', elements: [], background: null, watermark: null };
    await saveWorkspaceData(parent.id, { ...getDefaultWorkspaceData(), template: parentTemplate });

    const child = await createSubWorkspace('Child', parent.id);
    await saveWorkspaceData(child.id, { ...getDefaultWorkspaceData(), templateLinkedToParent: true });

    const dup = await duplicateWorkspace(child.id, 'Child (copy)', parent.id);
    const dupData = await getWorkspaceData(dup.id);
    // The duplicate captured the parent's CURRENT template as its own, independent copy.
    expect(dupData?.template).toEqual(parentTemplate);
    expect(dupData?.templateLinkedToParent).toBeUndefined();
  });

  it('duplicates a workspace with no saved data using the default data as a source', async () => {
    const source = await createWorkspace('Empty Source');
    const dup = await duplicateWorkspace(source.id, 'Empty Copy');
    expect(await getWorkspaceData(dup.id)).toEqual(getDefaultWorkspaceData());
  });
});
