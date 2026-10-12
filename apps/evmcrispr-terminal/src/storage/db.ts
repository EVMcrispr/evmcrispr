export const DB_NAME = "evmcrispr";
export const DB_VERSION = 1;

/** Opens the records database. `onOutdated` fires when a newer version of
 *  the app wants to upgrade it: the connection is already closed, and the
 *  tab should ask to be reloaded. */
export function openDb(onOutdated: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Inside the executor: a browser that refuses storage throws on access.
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore("spaces", { keyPath: "id" });
      db.createObjectStore("entries", { keyPath: ["spaceId", "id"] });
      db.createObjectStore("runs", { keyPath: ["spaceId", "id"] });
      db.createObjectStore("removals", { keyPath: ["spaceId", "entryId"] });
      db.createObjectStore("chats", { keyPath: "id" });
      db.createObjectStore("markers", { keyPath: "spaceId" });
      db.createObjectStore("prefs", { keyPath: "name" });
    };
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => {
        db.close();
        onOutdated();
      };
      resolve(db);
    };
    open.onerror = () => reject(open.error);
    open.onblocked = () =>
      reject(new Error("The database is in use by an older tab"));
  });
}

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Runs `work` in one transaction and resolves once it has committed. */
export function transact<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
    Promise.resolve(work(tx)).then(
      (value) => {
        result = value;
      },
      (err) => {
        reject(err);
        tx.abort();
      },
    );
  });
}

/** Every record of one space in a store keyed `[spaceId, …]`. */
export function ofSpace(spaceId: string): IDBKeyRange {
  return IDBKeyRange.bound([spaceId], [spaceId, []]);
}
