import { getWorkspaceList, getWorkspaceData, saveWorkspaceData, LIST_KEY } from './workspaceStorage';
import { resolveWorkspaceAssets } from './assetStore';
import { loadUserTemplates, STORAGE_KEY as USER_TEMPLATES_KEY } from './userTemplates';
import { loadPrintPresets, STORAGE_KEY as PRINT_PRESETS_KEY } from './printPresets';
import type { WorkspaceListState, WorkspaceData } from './workspaceStorage';
import type { PrintPreset } from '../types';

export interface BackupData {
  version: 1;
  exportedAt: string;
  app: 'id_card_generator';
  workspaceList: WorkspaceListState;
  workspaceData: Record<string, WorkspaceData>;
  userTemplates: { meta: { id: string; name: string; savedAt: string }; template: unknown }[];
  printPresets: PrintPreset[];
}

export function isBackupData(obj: unknown): obj is BackupData {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    o.version === 1 &&
    o.app === 'id_card_generator' &&
    typeof o.workspaceList === 'object' &&
    typeof o.workspaceData === 'object' &&
    Array.isArray(o.userTemplates) &&
    Array.isArray(o.printPresets)
  );
}

export async function createBackup(): Promise<BackupData> {
  const workspaceList = getWorkspaceList();
  const workspaceData: Record<string, WorkspaceData> = {};
  for (const w of workspaceList.workspaces) {
    const data = getWorkspaceData(w.id);
    if (data) {
      // Resolve asset: refs so the backup JSON is self-contained.
      workspaceData[w.id] = await resolveWorkspaceAssets(data);
    }
  }
  const userTemplates = loadUserTemplates();
  const printPresets = loadPrintPresets();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'id_card_generator',
    workspaceList,
    workspaceData,
    userTemplates,
    printPresets,
  };
}

export async function downloadBackup(): Promise<void> {
  const backup = await createBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `id-card-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export type RestoreResult = { ok: true } | { ok: false; error: string };

export function restoreFromBackup(backup: BackupData): RestoreResult {
  try {
    if (!isBackupData(backup)) {
      return { ok: false, error: 'Invalid backup file format.' };
    }

    const { workspaceList, workspaceData, userTemplates, printPresets } = backup;

    const knownIds = new Set(workspaceList.workspaces.map((w) => w.id));

    if (workspaceList.currentId && !knownIds.has(workspaceList.currentId)) {
      workspaceList.currentId = workspaceList.workspaces.length > 0 ? workspaceList.workspaces[0].id : '';
    }

    localStorage.setItem(LIST_KEY, JSON.stringify(workspaceList));

    for (const [id, data] of Object.entries(workspaceData)) {
      if (!knownIds.has(id)) continue; // skip unrecognized keys
      if (data && typeof data === 'object' && data.template && Array.isArray(data.records)) {
        // Route through saveWorkspaceData so large data URLs in the backup are
        // externalized to the asset store instead of hitting the localStorage quota.
        if (!saveWorkspaceData(id, data)) {
          return { ok: false, error: 'Browser storage is full — the backup could not be fully restored.' };
        }
      }
    }

    localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(userTemplates));
    localStorage.setItem(PRINT_PRESETS_KEY, JSON.stringify(printPresets));

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to restore backup.',
    };
  }
}
