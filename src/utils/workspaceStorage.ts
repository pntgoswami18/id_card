import type { Template, CardRecord, ColumnMapping, PrintPreset, PrintSettings } from '../types';
import type { ParsedCsv } from './csv';
import { externalizeWorkspaceAssets } from './assetStore';
import { createIdbTable } from './idbStore';
import { STORE_NAMES } from './idbSchema';

/** Legacy localStorage keys — kept exported only for storageMigration.ts to read from. */
export const LIST_KEY = 'id_card_workspace_list';
export const DATA_PREFIX = 'id_card_workspace_data_';

/** Key the single workspace-list record is stored under in the `workspaceList` IndexedDB store. */
const LIST_RECORD_KEY = 'current';

export interface WorkspaceMeta {
  id: string;
  name: string;
  /** Data URL or image URL for workspace logo. */
  logo?: string;
  /** If set, this workspace is a child of the given parent. Max one level deep. */
  parentId?: string;
}

export interface WorkspaceListState {
  currentId: string;
  workspaces: WorkspaceMeta[];
}

/** Per-workspace persisted state (project data). */
export interface WorkspaceData {
  template: Template;
  records: CardRecord[];
  columnMapping: ColumnMapping;
  printPresets: PrintPreset[];
  printSettings: PrintSettings;
  selectedCardIndices: number[];
  currentTemplateSource: { type: 'built-in'; id: string } | { type: 'user'; id: string } | null;
  /** Data URL or image URL for workspace logo. */
  logo?: string;
  /** Parsed CSV retained so the Data step can show column-mapping on reload. */
  csvData?: ParsedCsv | null;
  /**
   * Copy-on-write template inheritance for sub-workspaces: while true, the
   * effective template is the parent's current template (see
   * getEffectiveWorkspaceData) and this workspace's own `template` is only a
   * fallback snapshot. Any template edit in the reducer clears the flag,
   * detaching the workspace into an independent copy.
   */
  templateLinkedToParent?: boolean;
}

const listTable = createIdbTable<WorkspaceListState>(STORE_NAMES.workspaceList);
const dataTable = createIdbTable<WorkspaceData>(STORE_NAMES.workspaceData);

export async function getWorkspaceList(): Promise<WorkspaceListState> {
  const parsed = (await listTable.get(LIST_RECORD_KEY)) ?? { currentId: '', workspaces: [] };
  if (!parsed.workspaces?.length) {
    return { currentId: '', workspaces: [] };
  }
  if (!parsed.currentId && parsed.workspaces[0]) {
    parsed.currentId = parsed.workspaces[0].id;
  }
  return parsed;
}

export async function saveWorkspaceList(state: WorkspaceListState): Promise<boolean> {
  const ok = await listTable.put(LIST_RECORD_KEY, state);
  if (!ok) console.warn('Storage error: workspace list could not be saved.');
  return ok;
}

export async function getWorkspaceData(id: string): Promise<WorkspaceData | null> {
  return dataTable.get(id);
}

/**
 * Persists workspace data. Large data URLs (background/watermark images, card
 * photos) are swapped for IndexedDB-backed `asset:` refs first, so the
 * stored entry stays small. Returns false when the write failed — callers
 * that create workspaces must abort and surface the error.
 */
export async function saveWorkspaceData(id: string, data: WorkspaceData): Promise<boolean> {
  const ok = await dataTable.put(id, externalizeWorkspaceAssets(data));
  if (!ok) console.warn('Storage error: workspace data could not be saved. Consider removing large images.');
  if (data.logo !== undefined) {
    await updateWorkspaceMeta(id, { logo: data.logo });
  }
  return ok;
}

/**
 * Returns workspace data with the copy-on-write template link applied: when
 * `templateLinkedToParent` is set and the parent exists, the parent's current
 * template overlays this workspace's own snapshot. Falls back to a detached
 * copy (flag cleared, own snapshot kept) when the parent is missing — the
 * detachment persists on the next save. Result may contain `asset:` refs;
 * resolve with `resolveWorkspaceAssets` before dispatching into app state.
 */
export async function getEffectiveWorkspaceData(id: string): Promise<WorkspaceData | null> {
  const data = await getWorkspaceData(id);
  if (!data?.templateLinkedToParent) return data;
  const list = await getWorkspaceList();
  const parentId = list.workspaces.find((w) => w.id === id)?.parentId;
  const parent = parentId ? await getWorkspaceData(parentId) : null;
  if (!parent) return { ...data, templateLinkedToParent: false };
  return { ...data, template: parent.template };
}

export function createWorkspaceId(): string {
  return `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createWorkspace(name: string, logo?: string): Promise<WorkspaceMeta> {
  const list = await getWorkspaceList();
  const id = createWorkspaceId();
  const meta: WorkspaceMeta = { id, name, ...(logo != null && logo !== '' && { logo }) };
  list.workspaces = [...list.workspaces, meta];
  list.currentId = id;
  await saveWorkspaceList(list);
  return meta;
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  const list = await getWorkspaceList();
  const idx = list.workspaces.findIndex((w) => w.id === id);
  if (idx >= 0) {
    list.workspaces = list.workspaces.slice();
    list.workspaces[idx] = { ...list.workspaces[idx], name };
    await saveWorkspaceList(list);
  }
}

export async function updateWorkspaceMeta(
  id: string,
  updates: { name?: string; logo?: string | null }
): Promise<void> {
  const list = await getWorkspaceList();
  const idx = list.workspaces.findIndex((w) => w.id === id);
  if (idx >= 0) {
    list.workspaces = list.workspaces.slice();
    const w = list.workspaces[idx];
    list.workspaces[idx] = {
      ...w,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.logo !== undefined && { logo: updates.logo || undefined }),
    };
    await saveWorkspaceList(list);
  }
}

export async function setCurrentWorkspace(id: string): Promise<void> {
  const list = await getWorkspaceList();
  if (list.workspaces.some((w) => w.id === id)) {
    list.currentId = id;
    await saveWorkspaceList(list);
  }
}

const defaultPrintSettings: PrintSettings = {
  widthMm: 85.6,
  heightMm: 53.98,
  orientation: 'portrait',
};

const emptyTemplate: Template = {
  id: 'blank',
  name: 'Blank',
  elements: [],
  background: null,
  watermark: null,
};

/** Returns the direct children of a parent workspace. */
export async function getChildWorkspaces(parentId: string): Promise<WorkspaceMeta[]> {
  const list = await getWorkspaceList();
  return list.workspaces.filter((w) => w.parentId === parentId);
}

/**
 * Creates a sub-workspace under the given parent. Switches to it as current.
 * Pass `existingId` when the workspace's data was already persisted under a
 * pre-generated id (write-data-first creation flow).
 */
export async function createSubWorkspace(name: string, parentId: string, logo?: string, existingId?: string): Promise<WorkspaceMeta> {
  const list = await getWorkspaceList();
  const parent = list.workspaces.find((w) => w.id === parentId);
  if (!parent) throw new Error(`createSubWorkspace: parent "${parentId}" not found`);
  if (parent.parentId) throw new Error(`createSubWorkspace: cannot nest sub-workspaces (parent "${parentId}" is already a child)`);
  const id = existingId ?? createWorkspaceId();
  const meta: WorkspaceMeta = { id, name, parentId, ...(logo != null && logo !== '' && { logo }) };
  list.workspaces = [...list.workspaces, meta];
  list.currentId = id;
  await saveWorkspaceList(list);
  return meta;
}

/**
 * Deletes a workspace and all its direct children.
 * After deletion the current workspace is reset to the first remaining workspace.
 */
export async function deleteWorkspaceTree(id: string): Promise<void> {
  const list = await getWorkspaceList();
  const childIds = list.workspaces.filter((w) => w.parentId === id).map((w) => w.id);
  const toDelete = new Set([id, ...childIds]);
  list.workspaces = list.workspaces.filter((w) => !toDelete.has(w.id));
  if (toDelete.has(list.currentId) || !list.workspaces.some((w) => w.id === list.currentId)) {
    if (list.workspaces.length > 0) {
      list.currentId = list.workspaces[0].id;
    } else {
      list.workspaces = [{ id: 'default', name: 'Default' }];
      list.currentId = 'default';
    }
  }
  await saveWorkspaceList(list);
  await Promise.all([...toDelete].map((delId) => dataTable.delete(delId)));
}

/** Deletes a single workspace's stored data row (not the list entry). */
export async function deleteWorkspaceData(id: string): Promise<void> {
  await dataTable.delete(id);
}

/**
 * Creates a full copy of a workspace (data + list entry) under a new ID.
 * Switches currentId to the new workspace.
 * parentId → creates as a sub-workspace; omit → creates as a root workspace.
 */
export async function duplicateWorkspace(
  sourceId: string,
  newName: string,
  parentId?: string,
): Promise<WorkspaceMeta> {
  // Duplicate from the EFFECTIVE data so a linked sub-workspace's duplicate
  // captures the parent's current template as an independent snapshot —
  // carrying the link flag to a different parent would silently swap designs.
  const raw = (await getEffectiveWorkspaceData(sourceId)) ?? getDefaultWorkspaceData();
  // Strip csvData from the copy — it can be large and is trivial to re-upload.
  const { csvData: _csv, templateLinkedToParent: _linked, ...sourceData } = raw;
  const newId = createWorkspaceId();
  const meta: WorkspaceMeta = {
    id: newId,
    name: newName,
    ...(parentId ? { parentId } : {}),
    ...(sourceData.logo ? { logo: sourceData.logo } : {}),
  };
  const list = await getWorkspaceList();
  list.workspaces = [...list.workspaces, meta];
  list.currentId = newId;
  await saveWorkspaceList(list);
  await saveWorkspaceData(newId, sourceData);
  return meta;
}

/** Default data for a new workspace. */
export function getDefaultWorkspaceData(): WorkspaceData {
  return {
    template: emptyTemplate,
    records: [],
    columnMapping: {},
    printPresets: [],
    printSettings: defaultPrintSettings,
    selectedCardIndices: [],
    currentTemplateSource: null,
  };
}
