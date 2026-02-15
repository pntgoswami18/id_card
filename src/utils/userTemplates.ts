import type { Template, UserTemplateMeta } from '../types';

const STORAGE_KEY = 'id-card-user-templates';

export function loadUserTemplates(): { meta: UserTemplateMeta; template: Template }[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { meta: UserTemplateMeta; template: Template }[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserTemplate(template: Template): void {
  const list = loadUserTemplates();
  const meta: UserTemplateMeta = {
    id: template.id,
    name: template.name,
    savedAt: new Date().toISOString(),
  };
  const existing = list.findIndex((t) => t.meta.id === template.id);
  const entry = { meta, template };
  const next = existing >= 0 ? list.map((t, i) => (i === existing ? entry : t)) : [...list, entry];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function deleteUserTemplate(id: string): void {
  const list = loadUserTemplates().filter((t) => t.meta.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function loadUserTemplateById(id: string): Template | null {
  const found = loadUserTemplates().find((t) => t.meta.id === id);
  return found ? found.template : null;
}
