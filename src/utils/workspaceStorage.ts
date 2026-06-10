import type { Template, CardRecord, ColumnMapping, PrintPreset, PrintSettings } from '../types';

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
  const fallback: WorkspaceListState = {
    currentId: '',
    workspaces: [{ id: 'default', name: 'Default' }],
  };
  const parsed = safeParse<WorkspaceListState>(raw, fallback);
  if (!parsed.workspaces?.length) {
    parsed.workspaces = [{ id: 'default', name: 'Default' }];
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

export function saveWorkspaceData(id: string, data: WorkspaceData): void {
  try {
    localStorage.setItem(DATA_PREFIX + id, JSON.stringify(data));
  } catch {
    console.warn('Storage quota exceeded: workspace data could not be saved. Consider removing large images.');
  }
  if (data.logo !== undefined) {
    updateWorkspaceMeta(id, { logo: data.logo });
  }
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

export function deleteWorkspace(id: string): void {
  const list = getWorkspaceList();
  list.workspaces = list.workspaces.filter((w) => w.id !== id);
  if (list.currentId === id && list.workspaces.length > 0) {
    list.currentId = list.workspaces[0].id;
  } else if (list.workspaces.length === 0) {
    list.workspaces = [{ id: 'default', name: 'Default' }];
    list.currentId = 'default';
  }
  saveWorkspaceList(list);
  localStorage.removeItem(DATA_PREFIX + id);
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

/** Creates a sub-workspace under the given parent. Switches to it as current. */
export function createSubWorkspace(name: string, parentId: string, logo?: string): WorkspaceMeta {
  const list = getWorkspaceList();
  const parent = list.workspaces.find((w) => w.id === parentId);
  if (!parent) throw new Error(`createSubWorkspace: parent "${parentId}" not found`);
  if (parent.parentId) throw new Error(`createSubWorkspace: cannot nest sub-workspaces (parent "${parentId}" is already a child)`);
  const id = createWorkspaceId();
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
