import type { Template, CardRecord, ColumnMapping, PrintPreset, PrintSettings } from '../types';
import type { ParsedCsv } from './csv';
import { externalizeWorkspaceAssets } from './assetStore';

export const LIST_KEY = 'id_card_workspace_list';
export const DATA_PREFIX = 'id_card_workspace_data_';

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

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getWorkspaceList(): WorkspaceListState {
  const raw = localStorage.getItem(LIST_KEY);
  const fallback: WorkspaceListState = { currentId: '', workspaces: [] };
  const parsed = safeParse<WorkspaceListState>(raw, fallback);
  if (!parsed.workspaces?.length) {
    return { currentId: '', workspaces: [] };
  }
  if (!parsed.currentId && parsed.workspaces[0]) {
    parsed.currentId = parsed.workspaces[0].id;
  }
  return parsed;
}

export function saveWorkspaceList(state: WorkspaceListState): void {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(state));
  } catch {
    console.warn('Storage quota exceeded: workspace list could not be saved.');
  }
}

export function getWorkspaceData(id: string): WorkspaceData | null {
  const raw = localStorage.getItem(DATA_PREFIX + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkspaceData;
  } catch {
    return null;
  }
}

/**
 * Persists workspace data. Large data URLs (background/watermark images, card
 * photos) are swapped for IndexedDB-backed `asset:` refs first, so the
 * localStorage entry stays small. Returns false when the write still failed
 * (quota) — callers that create workspaces must abort and surface the error.
 */
export function saveWorkspaceData(id: string, data: WorkspaceData): boolean {
  let ok = true;
  try {
    localStorage.setItem(DATA_PREFIX + id, JSON.stringify(externalizeWorkspaceAssets(data)));
  } catch {
    console.warn('Storage quota exceeded: workspace data could not be saved. Consider removing large images.');
    ok = false;
  }
  if (data.logo !== undefined) {
    updateWorkspaceMeta(id, { logo: data.logo });
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
export function getEffectiveWorkspaceData(id: string): WorkspaceData | null {
  const data = getWorkspaceData(id);
  if (!data?.templateLinkedToParent) return data;
  const parentId = getWorkspaceList().workspaces.find((w) => w.id === id)?.parentId;
  const parent = parentId ? getWorkspaceData(parentId) : null;
  if (!parent) return { ...data, templateLinkedToParent: false };
  return { ...data, template: parent.template };
}

export function createWorkspaceId(): string {
  return `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createWorkspace(name: string, logo?: string): WorkspaceMeta {
  const list = getWorkspaceList();
  const id = createWorkspaceId();
  const meta: WorkspaceMeta = { id, name, ...(logo != null && logo !== '' && { logo }) };
  list.workspaces = [...list.workspaces, meta];
  list.currentId = id;
  saveWorkspaceList(list);
  return meta;
}

export function renameWorkspace(id: string, name: string): void {
  const list = getWorkspaceList();
  const idx = list.workspaces.findIndex((w) => w.id === id);
  if (idx >= 0) {
    list.workspaces = list.workspaces.slice();
    list.workspaces[idx] = { ...list.workspaces[idx], name };
    saveWorkspaceList(list);
  }
}

export function updateWorkspaceMeta(
  id: string,
  updates: { name?: string; logo?: string | null }
): void {
  const list = getWorkspaceList();
  const idx = list.workspaces.findIndex((w) => w.id === id);
  if (idx >= 0) {
    list.workspaces = list.workspaces.slice();
    const w = list.workspaces[idx];
    list.workspaces[idx] = {
      ...w,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.logo !== undefined && { logo: updates.logo || undefined }),
    };
    saveWorkspaceList(list);
  }
}

export function setCurrentWorkspace(id: string): void {
  const list = getWorkspaceList();
  if (list.workspaces.some((w) => w.id === id)) {
    list.currentId = id;
    saveWorkspaceList(list);
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
export function getChildWorkspaces(parentId: string): WorkspaceMeta[] {
  return getWorkspaceList().workspaces.filter((w) => w.parentId === parentId);
}

/**
 * Creates a sub-workspace under the given parent. Switches to it as current.
 * Pass `existingId` when the workspace's data was already persisted under a
 * pre-generated id (write-data-first creation flow).
 */
export function createSubWorkspace(name: string, parentId: string, logo?: string, existingId?: string): WorkspaceMeta {
  const list = getWorkspaceList();
  const parent = list.workspaces.find((w) => w.id === parentId);
  if (!parent) throw new Error(`createSubWorkspace: parent "${parentId}" not found`);
  if (parent.parentId) throw new Error(`createSubWorkspace: cannot nest sub-workspaces (parent "${parentId}" is already a child)`);
  const id = existingId ?? createWorkspaceId();
  const meta: WorkspaceMeta = { id, name, parentId, ...(logo != null && logo !== '' && { logo }) };
  list.workspaces = [...list.workspaces, meta];
  list.currentId = id;
  saveWorkspaceList(list);
  return meta;
}

/**
 * Deletes a workspace and all its direct children.
 * After deletion the current workspace is reset to the first remaining workspace.
 */
export function deleteWorkspaceTree(id: string): void {
  const list = getWorkspaceList();
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
  saveWorkspaceList(list);
  toDelete.forEach((delId) => localStorage.removeItem(DATA_PREFIX + delId));
}

/**
 * Creates a full copy of a workspace (data + list entry) under a new ID.
 * Switches currentId to the new workspace.
 * parentId → creates as a sub-workspace; omit → creates as a root workspace.
 */
export function duplicateWorkspace(
  sourceId: string,
  newName: string,
  parentId?: string,
): WorkspaceMeta {
  // Duplicate from the EFFECTIVE data so a linked sub-workspace's duplicate
  // captures the parent's current template as an independent snapshot —
  // carrying the link flag to a different parent would silently swap designs.
  const raw = getEffectiveWorkspaceData(sourceId) ?? getDefaultWorkspaceData();
  // Strip csvData from the copy — it can be large and is trivial to re-upload.
  const { csvData: _csv, templateLinkedToParent: _linked, ...sourceData } = raw;
  const newId = createWorkspaceId();
  const meta: WorkspaceMeta = {
    id: newId,
    name: newName,
    ...(parentId ? { parentId } : {}),
    ...(sourceData.logo ? { logo: sourceData.logo } : {}),
  };
  const list = getWorkspaceList();
  list.workspaces = [...list.workspaces, meta];
  list.currentId = newId;
  saveWorkspaceList(list);
  saveWorkspaceData(newId, sourceData);
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
