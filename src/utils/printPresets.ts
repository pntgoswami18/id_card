import type { PrintPreset } from '../types';
import { createIdbTable } from './idbStore';
import { STORE_NAMES } from './idbSchema';

/** Legacy localStorage key — kept exported only for storageMigration.ts to read from. */
export const STORAGE_KEY = 'id-card-print-presets';

const table = createIdbTable<PrintPreset>(STORE_NAMES.printPresets);

export async function loadPrintPresets(): Promise<PrintPreset[]> {
  return table.getAll();
}

export async function savePrintPreset(preset: PrintPreset): Promise<boolean> {
  return table.put(preset.id, preset);
}

export async function deletePrintPreset(id: string): Promise<boolean> {
  return table.delete(id);
}

/** Replaces the whole stored list (backup restore). Returns false on failure. */
export async function replacePrintPresets(presets: PrintPreset[]): Promise<boolean> {
  const cleared = await table.clear();
  if (!cleared) return false;
  return table.putMany(presets.map((p) => ({ key: p.id, value: p })));
}
