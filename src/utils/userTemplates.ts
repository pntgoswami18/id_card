import type { Template, UserTemplateMeta } from '../types';
import { externalizeTemplateAssets, resolveTemplateAssets } from './assetStore';

export const STORAGE_KEY = 'id-card-user-templates';

export type UserTemplateEntry = { meta: UserTemplateMeta; template: Template };

/**
 * Returns the stored template list. Templates may contain `asset:` refs in
 * place of large data URLs — safe for rendering the picker list (meta only),
 * but callers must `await resolveTemplateAssets(template)` before a template
 * enters app state or a self-contained artifact (.idtemplate, backup JSON).
 */
export function loadUserTemplates(): UserTemplateEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserTemplateEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Stored list with every template's `asset:` refs resolved back to data URLs. */
export async function loadResolvedUserTemplates(): Promise<UserTemplateEntry[]> {
  return Promise.all(
    loadUserTemplates().map(async (entry) => ({
      ...entry,
      template: await resolveTemplateAssets(entry.template),
    })),
  );
}

function writeList(list: UserTemplateEntry[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    console.warn('Storage quota exceeded: could not save user templates.');
    return false;
  }
}

/**
 * Persists a user template. Large background/watermark data URLs are swapped
 * for IndexedDB-backed `asset:` refs first, so the localStorage entry stays
 * small. Returns false when the write still failed (quota) — callers must
 * surface this instead of silently dropping the template.
 */
export function saveUserTemplate(template: Template): boolean {
  const list = loadUserTemplates();
  const meta: UserTemplateMeta = {
    id: template.id,
    name: template.name,
    savedAt: new Date().toISOString(),
  };
  const existing = list.findIndex((t) => t.meta.id === template.id);
  const entry = { meta, template: externalizeTemplateAssets(template) };
  const next = existing >= 0 ? list.map((t, i) => (i === existing ? entry : t)) : [...list, entry];
  return writeList(next);
}

export function deleteUserTemplate(id: string): void {
  writeList(loadUserTemplates().filter((t) => t.meta.id !== id));
}

/**
 * Replaces the whole stored list (backup restore). Templates arriving with
 * inline data URLs are externalized; original `savedAt` metadata is preserved.
 * Returns false on quota failure.
 */
export function restoreUserTemplates(entries: UserTemplateEntry[]): boolean {
  return writeList(
    entries.map((entry) => ({ ...entry, template: externalizeTemplateAssets(entry.template) })),
  );
}
