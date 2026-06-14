import type { Template } from '../types';
import type { WorkspaceData } from './workspaceStorage';

// ---- File System Access API types (not in standard lib.dom) ----
interface FSWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface WorkspaceFileHandle {
  createWritable(): Promise<FSWritable>;
}
type SavePickerOpts = {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
};
type OpenPickerOpts = {
  multiple?: boolean;
  types?: { description?: string; accept: Record<string, string[]> }[];
};
type WindowWithFSA = Window & {
  showSaveFilePicker?: (opts?: SavePickerOpts) => Promise<WorkspaceFileHandle>;
  showOpenFilePicker?: (opts?: OpenPickerOpts) => Promise<Array<{ getFile(): Promise<File> }>>;
};

// ---- Workspace file format ----

export interface WorkspaceFile {
  version: 1;
  app: 'id_card_generator';
  type: 'workspace';
  savedAt: string;
  name: string;
  data: WorkspaceData;
}

export function isWorkspaceFile(obj: unknown): obj is WorkspaceFile {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    o.version === 1 &&
    o.app === 'id_card_generator' &&
    o.type === 'workspace' &&
    typeof o.name === 'string' &&
    !!o.data &&
    typeof o.data === 'object'
  );
}

function buildFileContent(name: string, data: WorkspaceData): string {
  const file: WorkspaceFile = {
    version: 1,
    app: 'id_card_generator',
    type: 'workspace',
    savedAt: new Date().toISOString(),
    name,
    data,
  };
  return JSON.stringify(file, null, 2);
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, '_') || 'workspace';
}

// ---- Capability detection ----

export function hasSaveFilePicker(): boolean {
  return typeof window !== 'undefined' && typeof (window as WindowWithFSA).showSaveFilePicker === 'function';
}

export function hasOpenFilePicker(): boolean {
  return typeof window !== 'undefined' && typeof (window as WindowWithFSA).showOpenFilePicker === 'function';
}

// ---- Save ----

/** Write workspace data to an existing file handle (used for autosave). Returns false on failure. */
export async function writeWorkspaceToHandle(
  handle: WorkspaceFileHandle,
  name: string,
  data: WorkspaceData,
): Promise<boolean> {
  try {
    const writable = await handle.createWritable();
    await writable.write(buildFileContent(name, data));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the OS save-file picker and save the workspace.
 * Returns the handle for subsequent autosave, or null if cancelled / API unavailable.
 * When API is unavailable, falls back to a direct download.
 */
export async function saveWorkspaceWithPicker(
  name: string,
  data: WorkspaceData,
): Promise<WorkspaceFileHandle | null> {
  const w = window as WindowWithFSA;
  if (!w.showSaveFilePicker) {
    downloadWorkspaceFile(name, data);
    return null;
  }
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: `${safeName(name)}.idcard`,
      types: [
        { description: 'ID Card Workspace', accept: { 'application/json': ['.idcard'] } },
      ],
    });
    const ok = await writeWorkspaceToHandle(handle, name, data);
    return ok ? handle : null;
  } catch (err) {
    if ((err as DOMException).name !== 'AbortError') console.error('Save workspace failed:', err);
    return null;
  }
}

/** Fallback download when File System Access API is not available. */
export function downloadWorkspaceFile(name: string, data: WorkspaceData): void {
  const blob = new Blob([buildFileContent(name, data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(name)}.idcard`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Open ----

/**
 * Open the OS file picker and read a workspace file.
 * Returns null if cancelled, not supported, or invalid format.
 */
export async function openWorkspaceWithPicker(): Promise<WorkspaceFile | null> {
  const w = window as WindowWithFSA;
  if (!w.showOpenFilePicker) return null;
  try {
    const [handle] = await w.showOpenFilePicker({
      types: [
        { description: 'ID Card Workspace', accept: { 'application/json': ['.idcard', '.json'] } },
      ],
    });
    const file = await handle.getFile();
    return readWorkspaceFile(file);
  } catch (err) {
    if ((err as DOMException).name !== 'AbortError') console.error('Open workspace failed:', err);
    return null;
  }
}

/** Parse a File (from a hidden <input type="file">) into a WorkspaceFile. Returns null if invalid. */
export async function readWorkspaceFile(file: File): Promise<WorkspaceFile | null> {
  try {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);
    return isWorkspaceFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---- Template file format ----

export interface TemplateFile {
  version: 1;
  app: 'id_card_generator';
  type: 'template';
  savedAt: string;
  name: string;
  template: Template;
}

export function isTemplateFile(obj: unknown): obj is TemplateFile {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    o.version === 1 &&
    o.app === 'id_card_generator' &&
    o.type === 'template' &&
    typeof o.name === 'string' &&
    !!o.template &&
    typeof o.template === 'object'
  );
}

function buildTemplateContent(name: string, template: Template): string {
  const file: TemplateFile = {
    version: 1,
    app: 'id_card_generator',
    type: 'template',
    savedAt: new Date().toISOString(),
    name,
    template,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Open the OS save-file picker and save a template.
 * Falls back to a direct download when FSA is unavailable.
 * Returns true if saved successfully (via FSA or download).
 */
export async function saveTemplateWithPicker(name: string, template: Template): Promise<boolean> {
  const w = window as WindowWithFSA;
  const content = buildTemplateContent(name, template);
  if (!w.showSaveFilePicker) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName(name)}.idtemplate`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: `${safeName(name)}.idtemplate`,
      types: [{ description: 'ID Card Template', accept: { 'application/json': ['.idtemplate'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (err) {
    if ((err as DOMException).name !== 'AbortError') console.error('Save template failed:', err);
    return false;
  }
}

/**
 * Open the OS file picker and read a template file.
 * Returns null if cancelled, not supported, or invalid format.
 */
export async function openTemplateWithPicker(): Promise<TemplateFile | null> {
  const w = window as WindowWithFSA;
  if (!w.showOpenFilePicker) return null;
  try {
    const [handle] = await w.showOpenFilePicker({
      types: [
        {
          description: 'ID Card Template',
          accept: { 'application/json': ['.idtemplate', '.json'] },
        },
      ],
    });
    const file = await handle.getFile();
    return readTemplateFile(file);
  } catch (err) {
    if ((err as DOMException).name !== 'AbortError') console.error('Open template failed:', err);
    return null;
  }
}

/** Parse a File into a TemplateFile. Returns null if invalid. */
export async function readTemplateFile(file: File): Promise<TemplateFile | null> {
  try {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);
    return isTemplateFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---- Autosave preference ----

const AUTOSAVE_PREF_KEY = 'id_card_autosave_to_file';

export function getAutoSavePref(): boolean {
  try {
    const v = localStorage.getItem(AUTOSAVE_PREF_KEY);
    return v === null ? true : v !== 'false'; // default on
  } catch {
    return true;
  }
}

export function setAutoSavePref(v: boolean): void {
  try {
    localStorage.setItem(AUTOSAVE_PREF_KEY, String(v));
  } catch {
    // ignore
  }
}
