import { DB_NAME, DB_VERSION, ALL_STORE_NAMES } from './idbSchema';

/**
 * Generic IndexedDB key/value table helper, shared by workspaceStorage.ts,
 * userTemplates.ts, and printPresets.ts so the open/onupgradeneeded/
 * onsuccess/onerror boilerplate (previously duplicated per-module in
 * assetStore.ts and fileHandleStore.ts) exists in exactly one place.
 *
 * Every function resolves to a safe default instead of throwing (null / [] /
 * false) — same contract fileHandleStore.ts already uses — so IndexedDB being
 * unavailable (private browsing, disabled, etc.) degrades callers gracefully
 * rather than crashing. Callers that need a true fallback (not just "no-op")
 * check the boolean/null return and branch accordingly.
 */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const name of ALL_STORE_NAMES) {
          if (!req.result.objectStoreNames.contains(name)) {
            req.result.createObjectStore(name);
          }
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // A future version bump (e.g. from another tab) invalidates this
        // connection — drop the cache so the next call reopens fresh.
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; resolve(null); };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
}

/** True if the `id_card_store` database is reachable in this environment. */
export async function isIdbAvailable(): Promise<boolean> {
  return (await openDb()) !== null;
}

export function createIdbTable<T>(storeName: string) {
  return {
    async get(key: IDBValidKey): Promise<T | null> {
      const db = await openDb();
      if (!db) return null;
      return new Promise<T | null>((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).get(key);
          req.onsuccess = () => resolve((req.result as T) ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    },

    async getAll(): Promise<T[]> {
      const db = await openDb();
      if (!db) return [];
      return new Promise<T[]>((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = () => resolve((req.result as T[]) ?? []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    },

    async getAllKeys(): Promise<IDBValidKey[]> {
      const db = await openDb();
      if (!db) return [];
      return new Promise<IDBValidKey[]>((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).getAllKeys();
          req.onsuccess = () => resolve(req.result ?? []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    },

    async put(key: IDBValidKey, value: T): Promise<boolean> {
      const db = await openDb();
      if (!db) return false;
      return new Promise<boolean>((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).put(value, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    },

    /** Writes every entry in a single transaction — much cheaper than N separate `put` calls. */
    async putMany(entries: { key: IDBValidKey; value: T }[]): Promise<boolean> {
      if (entries.length === 0) return true;
      const db = await openDb();
      if (!db) return false;
      return new Promise<boolean>((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          for (const { key, value } of entries) store.put(value, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    },

    async delete(key: IDBValidKey): Promise<boolean> {
      const db = await openDb();
      if (!db) return false;
      return new Promise<boolean>((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).delete(key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    },

    /** Deletes every entry in the store — used by backup-restore "replace all" flows. */
    async clear(): Promise<boolean> {
      const db = await openDb();
      if (!db) return false;
      return new Promise<boolean>((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).clear();
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    },
  };
}
