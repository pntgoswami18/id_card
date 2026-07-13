import { getWorkspaceList, getWorkspaceData, saveWorkspaceData, saveWorkspaceList } from './workspaceStorage';
import { resolveWorkspaceAssets } from './assetStore';
import { loadResolvedUserTemplates, restoreUserTemplates } from './userTemplates';
import type { UserTemplateEntry } from './userTemplates';
import { loadPrintPresets, replacePrintPresets } from './printPresets';
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
  const workspaceList = await getWorkspaceList();
  const workspaceData: Record<string, WorkspaceData> = {};
  for (const w of workspaceList.workspaces) {
    const data = await getWorkspaceData(w.id);
    if (data) {
      // Resolve asset: refs so the backup JSON is self-contained.
      workspaceData[w.id] = await resolveWorkspaceAssets(data);
    }
  }
  // Resolve asset: refs so template images in the backup JSON are self-contained.
  const userTemplates = await loadResolvedUserTemplates();
  const printPresets = await loadPrintPresets();

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

export async function restoreFromBackup(backup: BackupData): Promise<RestoreResult> {
  try {
    if (!isBackupData(backup)) {
      return { ok: false, error: 'Invalid backup file format.' };
    }

    const { workspaceList, workspaceData, userTemplates, printPresets } = backup;

    const knownIds = new Set(workspaceList.workspaces.map((w) => w.id));

    if (workspaceList.currentId && !knownIds.has(workspaceList.currentId)) {
      workspaceList.currentId = workspaceList.workspaces.length > 0 ? workspaceList.workspaces[0].id : '';
    }

    if (!(await saveWorkspaceList(workspaceList))) {
      return { ok: false, error: 'Browser storage is full — the backup could not be fully restored.' };
    }

    for (const [id, data] of Object.entries(workspaceData)) {
      if (!knownIds.has(id)) continue; // skip unrecognized keys
      if (data && typeof data === 'object' && data.template && Array.isArray(data.records)) {
        // Route through saveWorkspaceData so large data URLs in the backup are
        // externalized to the asset store instead of hitting the localStorage quota.
        if (!(await saveWorkspaceData(id, data))) {
          return { ok: false, error: 'Browser storage is full — the backup could not be fully restored.' };
        }
      }
    }

    // Route through restoreUserTemplates so large template images are
    // externalized to the asset store instead of hitting the localStorage quota.
    if (!(await restoreUserTemplates(userTemplates as UserTemplateEntry[]))) {
      return { ok: false, error: 'Browser storage is full — user templates could not be fully restored.' };
    }
    if (!(await replacePrintPresets(printPresets))) {
      return { ok: false, error: 'Browser storage is full — print presets could not be fully restored.' };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to restore backup.',
    };
  }
}
