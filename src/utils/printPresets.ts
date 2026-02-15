import type { PrintPreset } from '../types';

const STORAGE_KEY = 'id-card-print-presets';

export function loadPrintPresets(): PrintPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PrintPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePrintPreset(preset: PrintPreset): void {
  const list = loadPrintPresets();
  const existing = list.findIndex((p) => p.id === preset.id);
  const next = existing >= 0 ? list.map((p, i) => (i === existing ? preset : p)) : [...list, preset];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function deletePrintPreset(id: string): void {
  const list = loadPrintPresets().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
