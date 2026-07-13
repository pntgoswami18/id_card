import { createIdbTable } from './idbStore';
import { ALL_STORE_NAMES } from './idbSchema';

/**
 * Wipes every `id_card_store` object store between tests. Prefer this over
 * `deleteDatabase` for test isolation — `fake-indexeddb`/real IndexedDB can
 * block or race a `deleteDatabase` call while a connection from an earlier
 * test is still open.
 */
export async function clearAllStores(): Promise<void> {
  await Promise.all(ALL_STORE_NAMES.map((name) => createIdbTable(name).clear()));
}
