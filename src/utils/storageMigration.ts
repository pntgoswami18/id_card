import { LIST_KEY as LEGACY_LIST_KEY, DATA_PREFIX as LEGACY_DATA_PREFIX } from './workspaceStorage';
import type { WorkspaceListState, WorkspaceData } from './workspaceStorage';
import { STORAGE_KEY as LEGACY_USER_TEMPLATES_KEY } from './userTemplates';
import type { UserTemplateEntry } from './userTemplates';
import { STORAGE_KEY as LEGACY_PRINT_PRESETS_KEY } from './printPresets';
import type { PrintPreset } from '../types';
import { createIdbTable, isIdbAvailable } from './idbStore';
import { STORE_NAMES } from './idbSchema';

/**
 * One-time migration of structural app data from localStorage (the pre-v2
 * storage backend) into the `id_card_store` IndexedDB database. See
 * src/utils/CLAUDE.md § "Primary storage migration" for the full design.
 *
 * Safety properties this file guarantees:
 * - Idempotent: every write is a keyed upsert (`put`), safe to re-run after
 *   an interruption without duplicating or corrupting anything.
 * - Non-destructive until verified: a legacy key is only ever removed after
 *   its IndexedDB copy has been read back and found to match exactly.
 * - Partial-failure tolerant: one corrupt/malformed legacy entry is skipped
 *   and recorded, never aborts migrating the rest.
 * - Concurrency-safe: if two tabs boot at once right after upgrade, both may
 *   run this concurrently. That is harmless — every write is an idempotent
 *   keyed `put`, `PURGE_LEGACY_KEYS` is off, and the idb `meta` record
 *   short-circuits any later run — so the copies simply race to the same
 *   result rather than corrupting each other.
 * - Storage-lock tolerant: every localStorage access goes through the guarded
 *   ls* helpers below, so a browser that throws on storage access (private
 *   mode / disabled by policy) degrades to "no legacy data found" instead of
 *   throwing out of the boot path.
 */

/** Guarded localStorage access — some browsers throw on access when storage is disabled. */
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  // If this throws (storage locked), the beacon just won't persist; the idb
  // `meta` record still prevents re-copying, so the migration stays idempotent.
  try { localStorage.setItem(key, value); } catch { /* storage locked — ignore */ }
}
function lsRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* storage locked — ignore */ }
}
function lsKeys(): string[] {
  try { return Object.keys(localStorage); } catch { return []; }
}

/** Write-once beacon: skip the whole migration subroutine once set. Monotonic — never reset. */
const BEACON_KEY = 'id_card_idb_migration_v1';
/** Write-once beacon: the post-migration notice (if any) has been shown once. */
const NOTICE_SHOWN_KEY = 'id_card_idb_migration_notice_shown';
/** Key inside the `meta` IndexedDB store holding migration status/results. */
const META_STATUS_KEY = 'migration_v1';

/**
 * Gate for actually deleting verified-safe legacy localStorage keys.
 * Deliberately off for an initial soak period after cutover — flip to `true`
 * in a small follow-up release once field confidence is established with no
 * corruption reports. This is the one line that reclaims the space.
 */
export const PURGE_LEGACY_KEYS = false;

interface MigrationStatus {
  status: 'in_progress' | 'complete';
  corruptSkipped: string[];
  verifyFailed: string[];
  startedAt?: string;
  completedAt?: string;
}

export interface MigrationRunResult {
  /** False when fast-pathed (already complete) or skipped (IndexedDB unavailable). */
  ran: boolean;
  /** True when IndexedDB was unavailable and migration could not run at all. */
  degraded: boolean;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isValidWorkspaceList(d: unknown): d is WorkspaceListState {
  return !!d && typeof d === 'object' && Array.isArray((d as WorkspaceListState).workspaces);
}

function isValidWorkspaceData(d: unknown): d is WorkspaceData {
  return !!d && typeof d === 'object' && 'template' in d && Array.isArray((d as WorkspaceData).records);
}

function isValidUserTemplateEntry(d: unknown): d is UserTemplateEntry {
  return !!d && typeof d === 'object' && !!(d as UserTemplateEntry).meta?.id && !!(d as UserTemplateEntry).template;
}

function isValidPrintPreset(d: unknown): d is PrintPreset {
  return !!d && typeof d === 'object' && typeof (d as PrintPreset).id === 'string';
}

/** Migrates one array-shaped legacy key (user templates / print presets) into its IndexedDB table. */
async function migrateArrayKey<T>(
  legacyKey: string,
  table: ReturnType<typeof createIdbTable<T>>,
  keyOf: (item: T) => string,
  isValid: (d: unknown) => d is T,
  corruptSkipped: string[],
  verifyFailed: string[],
): Promise<void> {
  const raw = lsGet(legacyKey);
  if (raw === null) return;
  const parsedArray = safeParse<unknown[]>(raw);
  if (!Array.isArray(parsedArray)) {
    corruptSkipped.push(legacyKey);
    return;
  }
  const batch: { key: string; value: T }[] = [];
  parsedArray.forEach((entry, index) => {
    if (isValid(entry)) {
      batch.push({ key: keyOf(entry), value: entry });
    } else {
      corruptSkipped.push(`${legacyKey}[${index}]`);
    }
  });
  if (batch.length === 0) return;
  const ok = await table.putMany(batch);
  let allVerified = ok;
  for (const { key, value } of batch) {
    if (!ok) { verifyFailed.push(`${legacyKey}:${key}`); continue; }
    const readBack = await table.get(key);
    if (JSON.stringify(readBack) !== JSON.stringify(value)) {
      verifyFailed.push(`${legacyKey}:${key}`);
      allVerified = false;
    }
  }
  if (allVerified && PURGE_LEGACY_KEYS) lsRemove(legacyKey);
}

async function runMigration(metaTable: ReturnType<typeof createIdbTable<MigrationStatus>>, resume: MigrationStatus | null): Promise<void> {
  const inProgress: MigrationStatus = resume?.status === 'in_progress'
    ? resume
    : { status: 'in_progress', corruptSkipped: [], verifyFailed: [], startedAt: new Date().toISOString() };
  await metaTable.put(META_STATUS_KEY, inProgress);

  const corruptSkipped: string[] = [];
  const verifyFailed: string[] = [];

  // ---- Workspace list (single record) ----
  const listTable = createIdbTable<WorkspaceListState>(STORE_NAMES.workspaceList);
  const rawListString = lsGet(LEGACY_LIST_KEY);
  if (rawListString !== null) {
    // Parse failures land here as `null`, same as a validly-parsed-but-wrong-shape
    // value — both are corrupt, distinct from the key being absent entirely.
    const rawList = safeParse<WorkspaceListState>(rawListString);
    if (isValidWorkspaceList(rawList)) {
      const ok = await listTable.put('current', rawList);
      const readBack = ok ? await listTable.get('current') : null;
      // Verify by value: both sides originate from JSON (parse on the source,
      // structured-clone on the read-back), and both preserve key insertion
      // order, so stringify equality is a safe deep-equal here.
      if (ok && JSON.stringify(readBack) === JSON.stringify(rawList)) {
        if (PURGE_LEGACY_KEYS) lsRemove(LEGACY_LIST_KEY);
      } else {
        verifyFailed.push(LEGACY_LIST_KEY);
      }
    } else {
      corruptSkipped.push(LEGACY_LIST_KEY);
    }
  }

  // ---- Workspace data (one row per workspace id) ----
  const dataTable = createIdbTable<WorkspaceData>(STORE_NAMES.workspaceData);
  const dataKeys = lsKeys().filter((k) => k.startsWith(LEGACY_DATA_PREFIX));
  const dataBatch: { key: string; value: WorkspaceData }[] = [];
  for (const key of dataKeys) {
    const id = key.slice(LEGACY_DATA_PREFIX.length);
    const raw = safeParse<WorkspaceData>(lsGet(key));
    if (isValidWorkspaceData(raw)) {
      dataBatch.push({ key: id, value: raw });
    } else {
      corruptSkipped.push(key);
    }
  }
  if (dataBatch.length > 0) {
    const ok = await dataTable.putMany(dataBatch);
    for (const { key: id, value: source } of dataBatch) {
      if (!ok) { verifyFailed.push(LEGACY_DATA_PREFIX + id); continue; }
      const readBack = await dataTable.get(id);
      if (JSON.stringify(readBack) === JSON.stringify(source)) {
        if (PURGE_LEGACY_KEYS) lsRemove(LEGACY_DATA_PREFIX + id);
      } else {
        verifyFailed.push(LEGACY_DATA_PREFIX + id);
      }
    }
  }

  // ---- User templates & print presets (array blob -> one row per item) ----
  await migrateArrayKey<UserTemplateEntry>(
    LEGACY_USER_TEMPLATES_KEY,
    createIdbTable<UserTemplateEntry>(STORE_NAMES.userTemplates),
    (e) => e.meta.id,
    isValidUserTemplateEntry,
    corruptSkipped,
    verifyFailed,
  );
  await migrateArrayKey<PrintPreset>(
    LEGACY_PRINT_PRESETS_KEY,
    createIdbTable<PrintPreset>(STORE_NAMES.printPresets),
    (e) => e.id,
    isValidPrintPreset,
    corruptSkipped,
    verifyFailed,
  );

  await metaTable.put(META_STATUS_KEY, {
    status: 'complete',
    corruptSkipped,
    verifyFailed,
    startedAt: inProgress.startedAt,
    completedAt: new Date().toISOString(),
  });
  lsSet(BEACON_KEY, 'complete');
}

/**
 * Runs the migration if it hasn't completed yet. Safe to call on every app
 * boot — the beacon check makes every call after the first a single
 * synchronous localStorage read. Must be awaited before any IndexedDB-backed
 * storage read (workspaceStorage/userTemplates/printPresets) during boot.
 */
export async function runMigrationIfNeeded(): Promise<MigrationRunResult> {
  if (lsGet(BEACON_KEY) === 'complete') {
    return { ran: false, degraded: false };
  }

  if (!(await isIdbAvailable())) {
    return { ran: false, degraded: true };
  }

  const metaTable = createIdbTable<MigrationStatus>(STORE_NAMES.meta);
  const existing = await metaTable.get(META_STATUS_KEY);
  if (existing?.status === 'complete') {
    // Meta says complete but the beacon is missing (e.g. localStorage partially
    // cleared) — trust the IndexedDB record, restore the beacon, skip re-copying.
    lsSet(BEACON_KEY, 'complete');
    return { ran: false, degraded: false };
  }

  const hasAnyLegacyData =
    lsGet(LEGACY_LIST_KEY) !== null ||
    lsKeys().some((k) => k.startsWith(LEGACY_DATA_PREFIX)) ||
    lsGet(LEGACY_USER_TEMPLATES_KEY) !== null ||
    lsGet(LEGACY_PRINT_PRESETS_KEY) !== null;

  if (!hasAnyLegacyData) {
    // Fresh install, or a previous run already purged everything — nothing to copy.
    await metaTable.put(META_STATUS_KEY, { status: 'complete', corruptSkipped: [], verifyFailed: [], completedAt: new Date().toISOString() });
    lsSet(BEACON_KEY, 'complete');
    return { ran: false, degraded: false };
  }

  await runMigration(metaTable, existing);
  return { ran: true, degraded: false };
}

/**
 * Checks (once) whether the last migration left any corrupt/unverifiable
 * entries behind, and reports it exactly once via the NOTICE_SHOWN_KEY
 * beacon. Call on every boot after `runMigrationIfNeeded` — cheap (a single
 * synchronous localStorage read) after the first successful check.
 * `checked: false` means IndexedDB was unavailable, so the caller should NOT
 * mark the notice as shown (there was nothing to check) and should retry on
 * a later boot.
 */
export async function getMigrationNoticeIfAny(): Promise<{ checked: boolean; count: number }> {
  if (lsGet(NOTICE_SHOWN_KEY) === 'shown') {
    return { checked: true, count: 0 };
  }
  if (!(await isIdbAvailable())) {
    return { checked: false, count: 0 };
  }
  const metaTable = createIdbTable<MigrationStatus>(STORE_NAMES.meta);
  const status = await metaTable.get(META_STATUS_KEY);
  lsSet(NOTICE_SHOWN_KEY, 'shown');
  if (!status) return { checked: true, count: 0 };
  return { checked: true, count: status.corruptSkipped.length + status.verifyFailed.length };
}

/**
 * Read-only legacy-localStorage fallback for the degraded boot path (IndexedDB
 * unavailable, so the normal idb-backed reads return nothing). The pre-v2 keys
 * are still present — never purged during the soak period — so an existing user
 * keeps read access to their workspaces even when idb can't be opened. Writes
 * still fail in this mode (surfaced via the storage-full banner); this only
 * restores the pre-migration read behaviour. Copy-on-write parent template
 * overlay is intentionally not applied here (a rare, already-degraded path).
 */
export function readLegacyWorkspaceList(): WorkspaceListState | null {
  const parsed = safeParse<WorkspaceListState>(lsGet(LEGACY_LIST_KEY));
  if (!isValidWorkspaceList(parsed)) return null;
  if (!parsed.currentId && parsed.workspaces[0]) parsed.currentId = parsed.workspaces[0].id;
  return parsed;
}

/** Read-only legacy-localStorage read of a single workspace's data. See readLegacyWorkspaceList. */
export function readLegacyWorkspaceData(id: string): WorkspaceData | null {
  const parsed = safeParse<WorkspaceData>(lsGet(LEGACY_DATA_PREFIX + id));
  return isValidWorkspaceData(parsed) ? parsed : null;
}
