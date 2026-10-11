import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { openDb } from "./db";
import { idbRecords, memoryRecords, type Records } from "./records";

export interface Storage {
  records: Records;
  /** Fills `doc` from what is stored and keeps it saved from then on. */
  persistDoc(spaceId: string, doc: Y.Doc): Promise<{ stop(): Promise<void> }>;
  deleteDoc(spaceId: string): Promise<void>;
  /** False when the browser refused storage: nothing outlives the tab. */
  persistent: boolean;
}

const docName = (spaceId: string) => `evmcrispr-space-${spaceId}`;

/** IndexedDB when the browser allows it, memory otherwise. */
export async function openStorage(onOutdated: () => void): Promise<Storage> {
  let db: IDBDatabase;
  try {
    db = await openDb(onOutdated);
  } catch {
    return memoryStorage();
  }
  return {
    records: idbRecords(db),
    persistent: true,
    async persistDoc(spaceId, doc) {
      const persistence = new IndexeddbPersistence(docName(spaceId), doc);
      await persistence.whenSynced;
      return { stop: () => persistence.destroy() };
    },
    async deleteDoc(spaceId) {
      await new IndexeddbPersistence(docName(spaceId), new Y.Doc()).clearData();
    },
  };
}

export function memoryStorage(): Storage {
  const docs = new Map<string, Uint8Array>();
  return {
    records: memoryRecords(),
    persistent: false,
    async persistDoc(spaceId, doc) {
      const stored = docs.get(spaceId);
      if (stored) Y.applyUpdate(doc, stored, "storage");
      const save = () => docs.set(spaceId, Y.encodeStateAsUpdate(doc));
      doc.on("update", save);
      return { stop: async () => doc.off("update", save) };
    },
    async deleteDoc(spaceId) {
      docs.delete(spaceId);
    },
  };
}
