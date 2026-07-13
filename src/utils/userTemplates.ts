import type { Template, UserTemplateMeta } from '../types';
import { externalizeTemplateAssets, resolveTemplateAssets } from './assetStore';
import { createIdbTable } from './idbStore';
import { STORE_NAMES } from './idbSchema';

/** Legacy localStorage key — kept exported only for storageMigration.ts to read from. */
export const STORAGE_KEY = 'id-card-user-templates';

export type UserTemplateEntry = { meta: UserTemplateMeta; template: Template };

const table = createIdbTable<UserTemplateEntry>(STORE_NAMES.userTemplates);

/**
 * Returns the stored template list. Templates may contain `asset:` refs in
 * place of large data URLs — safe for rendering the picker list (meta only),
 * but callers must `await resolveTemplateAssets(template)` before a template
 * enters app state or a self-contained artifact (.idtemplate, backup JSON).
 */
export async function loadUserTemplates(): Promise<UserTemplateEntry[]> {
  return table.getAll();
}

/** Stored list with every template's `asset:` refs resolved back to data URLs. */
export async function loadResolvedUserTemplates(): Promise<UserTemplateEntry[]> {
  const list = await loadUserTemplates();
  return Promise.all(
    list.map(async (entry) => ({
      ...entry,
      template: await resolveTemplateAssets(entry.template),
    })),
  );
}

/**
 * Persists a user template. Large background/watermark data URLs are swapped
 * for IndexedDB-backed `asset:` refs first, so the stored entry stays small.
 * Returns false when the write failed — callers must surface this instead of
 * silently dropping the template.
 */
export async function saveUserTemplate(template: Template): Promise<boolean> {
  const meta: UserTemplateMeta = {
    id: template.id,
    name: template.name,
    savedAt: new Date().toISOString(),
  };
  const entry: UserTemplateEntry = { meta, template: externalizeTemplateAssets(template) };
  return table.put(meta.id, entry);
}

export async function deleteUserTemplate(id: string): Promise<boolean> {
  return table.delete(id);
}

/**
 * Replaces the whole stored list (backup restore). Templates arriving with
 * inline data URLs are externalized; original `savedAt` metadata is preserved.
 * Returns false on failure.
 */
export async function restoreUserTemplates(entries: UserTemplateEntry[]): Promise<boolean> {
  const cleared = await table.clear();
  if (!cleared) return false;
  const mapped = entries.map((entry) => ({ ...entry, template: externalizeTemplateAssets(entry.template) }));
  return table.putMany(mapped.map((entry) => ({ key: entry.meta.id, value: entry })));
}
