/**
 * Single source of truth for the `id_card_store` IndexedDB database — name,
 * version, and every object store it contains. All consuming modules
 * (workspaceStorage.ts, userTemplates.ts, printPresets.ts, storageMigration.ts)
 * must import STORE_NAMES from here rather than passing a literal string to
 * createIdbTable, so that whichever module's connection opens the database
 * first still creates every store in the single onupgradeneeded pass.
 *
 * `id_card_assets` (assetStore.ts) and `id_card_file_handles`
 * (fileHandleStore.ts) are deliberately separate databases — see
 * src/utils/CLAUDE.md for why they are not folded in here.
 */

export const DB_NAME = 'id_card_store';
export const DB_VERSION = 1;

export const STORE_NAMES = {
  workspaceList: 'workspaceList',
  workspaceData: 'workspaceData',
  userTemplates: 'userTemplates',
  printPresets: 'printPresets',
  meta: 'meta',
} as const;

export const ALL_STORE_NAMES: readonly string[] = Object.values(STORE_NAMES);
