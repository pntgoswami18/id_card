import { getWorkspaceList, getWorkspaceData } from './workspaceStorage';
import { loadUserTemplates } from './userTemplates';
import { loadPrintPresets } from './printPresets';
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

function isBackupData(obj: unknown): obj is BackupData {
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

export function createBackup(): BackupData {
  const workspaceList = getWorkspaceList();
  const workspaceData: Record<string, WorkspaceData> = {};
  for (const w of workspaceList.workspaces) {
    const data = getWorkspaceData(w.id);
    if (data) {
      workspaceData[w.id] = data;
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

export function downloadBackup(): void {
  const backup = createBackup();
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

    localStorage.setItem('id_card_workspace_list', JSON.stringify(workspaceList));

    for (const [id, data] of Object.entries(workspaceData)) {
      if (data && typeof data === 'object' && data.template && Array.isArray(data.records)) {
        localStorage.setItem(`id_card_workspace_data_${id}`, JSON.stringify(data));
      }
    }

    localStorage.setItem('id-card-user-templates', JSON.stringify(userTemplates));
    localStorage.setItem('id-card-print-presets', JSON.stringify(printPresets));

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to restore backup.',
    };
  }
}
