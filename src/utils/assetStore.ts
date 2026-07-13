import type { Template, CardRecord } from '../types';
import type { WorkspaceData } from './workspaceStorage';

/**
 * Content-addressed store for large data URLs (template background/watermark
 * images, card photo overrides) backed by IndexedDB. At persistence time,
 * `externalizeWorkspaceAssets` swaps each large data URL for a small
 * `asset:<hash>` reference so localStorage holds only compact JSON; duplicating
 * a template across workspaces then shares one stored copy instead of
 * multiplying multi-MB base64 strings against the ~5MB localStorage quota.
 * At load time `resolveWorkspaceAssets` swaps references back to data URLs, so
 * in-memory state and all rendering code only ever see plain data URLs.
 */

const DB_NAME = 'id_card_assets';
const STORE_NAME = 'assets';
const REF_PREFIX = 'asset:';
/** Data URLs at or below this length stay inline in localStorage. */
const INLINE_LIMIT = 8 * 1024;

export function isAssetRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(REF_PREFIX);
}

function shouldExternalize(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:') && value.length > INLINE_LIMIT;
}

/** FNV-1a 32-bit with two seeds, plus length — cheap synchronous content hash. */
function hashAsset(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return `${REF_PREFIX}${h1.toString(36)}-${h2.toString(36)}-${s.length.toString(36)}`;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(id: string, dataUrl: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(dataUrl, id);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
      tx.onabort = () => { db.close(); resolve(false); };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

async function idbGet(id: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => { db.close(); resolve(typeof req.result === 'string' ? req.result : null); };
      req.onerror = () => { db.close(); resolve(null); };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/**
 * In-session cache of asset content keyed by ref. Serves resolves immediately
 * after a save (before the async IndexedDB put lands) and keeps the app
 * functional in-session even when IndexedDB is unavailable.
 */
const memCache = new Map<string, string>();
/** Refs whose IndexedDB put succeeded or was found present — skip re-writing multi-MB values. */
const persisted = new Set<string>();

/**
 * Returns the `asset:` ref for a data URL, caching it in memory and persisting
 * it to IndexedDB in the background (idempotent — content-hashed key).
 */
export function storeAssetSync(dataUrl: string): string {
  const id = hashAsset(dataUrl);
  memCache.set(id, dataUrl);
  if (!persisted.has(id)) {
    persisted.add(id);
    void idbPut(id, dataUrl).then((ok) => {
      if (!ok) {
        persisted.delete(id);
        console.warn('Asset store: failed to persist asset to IndexedDB; it will be retried on the next save.');
      }
    });
  }
  return id;
}

export async function getAsset(ref: string): Promise<string | null> {
  const cached = memCache.get(ref);
  if (cached) return cached;
  const fromDb = await idbGet(ref);
  if (fromDb) {
    memCache.set(ref, fromDb);
    persisted.add(ref);
  }
  return fromDb;
}

/** Template-level externalize — same swap as `externalizeWorkspaceAssets`, for user-template persistence. */
export function externalizeTemplateAssets(template: Template): Template {
  let out = template;
  if (out.background && shouldExternalize(out.background.value)) {
    out = { ...out, background: { ...out.background, value: storeAssetSync(out.background.value) } };
  }
  if (out.watermark && shouldExternalize(out.watermark.value)) {
    out = { ...out, watermark: { ...out.watermark, value: storeAssetSync(out.watermark.value) } };
  }
  return out;
}

function externalizeRecords(records: CardRecord[]): CardRecord[] {
  let changed = false;
  const out = records.map((r) => {
    const entries = Object.entries(r.overrides ?? {});
    if (!entries.some(([, v]) => shouldExternalize(v))) return r;
    changed = true;
    const overrides = Object.fromEntries(
      entries.map(([k, v]) => [k, shouldExternalize(v) ? storeAssetSync(v) : v]),
    );
    return { ...r, overrides };
  });
  return changed ? out : records;
}

/**
 * Swap large data URLs for `asset:` refs before writing to localStorage.
 * Synchronous — refs are computed inline; the IndexedDB writes happen in the
 * background. Idempotent: values that are already refs pass through untouched.
 */
export function externalizeWorkspaceAssets(data: WorkspaceData): WorkspaceData {
  const template = data.template ? externalizeTemplateAssets(data.template) : data.template;
  const records = data.records ? externalizeRecords(data.records) : data.records;
  if (template === data.template && records === data.records) return data;
  return { ...data, template, records };
}

/** Template-level resolve — must be awaited before a stored user template enters app state or a self-contained artifact. */
export async function resolveTemplateAssets(template: Template): Promise<Template> {
  let out = template;
  if (out.background && isAssetRef(out.background.value)) {
    const dataUrl = await getAsset(out.background.value);
    if (dataUrl) {
      out = { ...out, background: { ...out.background, value: dataUrl } };
    } else {
      console.warn('Asset store: background image asset missing; dropping background.');
      out = { ...out, background: null };
    }
  }
  if (out.watermark && isAssetRef(out.watermark.value)) {
    const dataUrl = await getAsset(out.watermark.value);
    if (dataUrl) {
      out = { ...out, watermark: { ...out.watermark, value: dataUrl } };
    } else {
      console.warn('Asset store: watermark image asset missing; dropping watermark.');
      out = { ...out, watermark: null };
    }
  }
  return out;
}

async function resolveRecords(records: CardRecord[]): Promise<CardRecord[]> {
  return Promise.all(
    records.map(async (r) => {
      const entries = Object.entries(r.overrides ?? {});
      if (!entries.some(([, v]) => isAssetRef(v))) return r;
      const resolved = await Promise.all(
        entries.map(async ([k, v]) => {
          if (!isAssetRef(v)) return [k, v] as const;
          const dataUrl = await getAsset(v);
          if (dataUrl === null) {
            console.warn(`Asset store: card override "${k}" asset missing; clearing it.`);
          }
          return [k, dataUrl] as const;
        }),
      );
      return { ...r, overrides: Object.fromEntries(resolved) };
    }),
  );
}

/**
 * Swap `asset:` refs back to data URLs after reading from localStorage.
 * Must be awaited before dispatching workspace data into app state or writing
 * it to a self-contained artifact (.idcard file, backup JSON). Data with no
 * refs (pre-migration or freshly edited in-memory state) passes through as-is.
 */
export async function resolveWorkspaceAssets(data: WorkspaceData): Promise<WorkspaceData> {
  const template = data.template ? await resolveTemplateAssets(data.template) : data.template;
  const records = data.records ? await resolveRecords(data.records) : data.records;
  if (template === data.template && records === data.records) return data;
  return { ...data, template, records };
}
