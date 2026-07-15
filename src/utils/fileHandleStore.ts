import type { WorkspaceFileHandle } from './workspaceFile';

// Persists FileSystemFileHandle objects (structured-cloneable, no serialization needed)
// keyed by root workspace id, so the .idcard file link survives a page reload.
// Every export resolves to a safe default rather than throwing — callers never need
// try/catch, and private browsing / IndexedDB-disabled degrades to in-memory-only.

const DB_NAME = 'id_card_file_handles';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Persist a handle for a root workspace id. Silently no-ops if IndexedDB is unavailable. */
export async function setStoredHandle(rootId: string, handle: WorkspaceFileHandle): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, rootId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    db.close();
  }
}

/** Retrieve a persisted handle for a root workspace id, or null if none/unavailable. */
export async function getStoredHandle(rootId: string): Promise<WorkspaceFileHandle | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<WorkspaceFileHandle | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(rootId);
      req.onsuccess = () => resolve((req.result as WorkspaceFileHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

/** Retrieve every persisted rootId -> handle pair. Used for reload-time isSameEntry matching. */
export async function getAllStoredHandles(): Promise<Map<string, WorkspaceFileHandle>> {
  const db = await openDb();
  const out = new Map<string, WorkspaceFileHandle>();
  if (!db) return out;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          out.set(String(cursor.key), cursor.value as WorkspaceFileHandle);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
  return out;
}

/** Remove a persisted handle for a root workspace id. Silently no-ops if unavailable. */
export async function deleteStoredHandle(rootId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(rootId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
}
