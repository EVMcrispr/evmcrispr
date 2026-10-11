import {
  emptyTimeline,
  type Markers,
  mergeTimeline,
  type SpaceMeta,
  type TimelinePatch,
  type TimelineState,
  toPatch,
} from "@evmcrispr/space";
import { ofSpace, request, transact } from "./db";

/** The records side of storage: everything except the Yjs documents. */
export interface Records {
  listSpaces(): Promise<SpaceMeta[]>;
  getSpace(id: string): Promise<SpaceMeta | undefined>;
  putSpace(meta: SpaceMeta): Promise<void>;
  /** Changes fields of one space's record; no-op when it does not exist. */
  patchSpace(id: string, patch: Partial<SpaceMeta>): Promise<void>;
  /** Removes the space's index record, timeline and markers. */
  deleteSpace(id: string): Promise<void>;
  loadTimeline(spaceId: string): Promise<Required<TimelinePatch>>;
  /** Merges with the stored timeline by `mergeTimeline`'s rules, atomically. */
  mergeTimeline(spaceId: string, patch: TimelinePatch): Promise<void>;
  getMarkers(spaceId: string): Promise<Markers>;
  patchMarkers(spaceId: string, patch: Partial<Markers>): Promise<Markers>;
  getPref<T>(name: string): Promise<T | undefined>;
  setPref(name: string, value: unknown): Promise<void>;
}

/** The timeline's stores. Each is named after its field of a patch. */
const TIMELINE = ["entries", "runs", "removals"] as const;

type Stored<T> = T & { spaceId: string };

const strip = <T>({ spaceId: _, ...record }: Stored<T>) => record as T;

export function idbRecords(db: IDBDatabase): Records {
  const one = <T>(store: string, key: IDBValidKey) =>
    transact(db, [store], "readonly", (tx) =>
      request<T | undefined>(tx.objectStore(store).get(key)),
    );

  return {
    listSpaces: () =>
      transact(db, ["spaces"], "readonly", (tx) =>
        request<SpaceMeta[]>(tx.objectStore("spaces").getAll()),
      ),
    getSpace: (id) => one<SpaceMeta>("spaces", id),
    putSpace: (meta) =>
      transact(db, ["spaces"], "readwrite", (tx) => {
        tx.objectStore("spaces").put(meta);
      }),
    patchSpace: (id, patch) =>
      transact(db, ["spaces"], "readwrite", async (tx) => {
        const store = tx.objectStore("spaces");
        const current = await request<SpaceMeta | undefined>(store.get(id));
        if (current) store.put({ ...current, ...patch, id });
      }),
    deleteSpace: (id) =>
      transact(db, ["spaces", "markers", ...TIMELINE], "readwrite", (tx) => {
        tx.objectStore("spaces").delete(id);
        tx.objectStore("markers").delete(id);
        for (const store of TIMELINE) tx.objectStore(store).delete(ofSpace(id));
      }),
    loadTimeline: (spaceId) =>
      transact(db, [...TIMELINE], "readonly", async (tx) => {
        const [entries, runs, removals] = await Promise.all(
          TIMELINE.map(async (store) =>
            (
              await request<Stored<unknown>[]>(
                tx.objectStore(store).getAll(ofSpace(spaceId)),
              )
            ).map(strip),
          ),
        );
        return { entries, runs, removals } as Required<TimelinePatch>;
      }),
    mergeTimeline: (spaceId, patch) =>
      transact(db, [...TIMELINE], "readwrite", async (tx) => {
        const ids = new Set([
          ...(patch.entries ?? []).map((e) => e.id),
          ...(patch.runs ?? []).map((r) => r.id),
          ...(patch.removals ?? []).map((r) => r.entryId),
        ]);
        // Only the records the patch touches are read; the rules are the
        // package's, so storage and memory can never disagree.
        const [entries, runs, removals] = await Promise.all(
          TIMELINE.map(async (store) =>
            (
              await Promise.all(
                [...ids].map((id) =>
                  request<Stored<unknown> | undefined>(
                    tx.objectStore(store).get([spaceId, id]),
                  ),
                ),
              )
            )
              .filter((row) => row !== undefined)
              .map(strip),
          ),
        );
        const stored = { entries, runs, removals } as Required<TimelinePatch>;
        const { changed } = mergeTimeline(
          mergeTimeline(emptyTimeline, stored).state,
          patch,
        );
        for (const removal of changed.removals) {
          tx.objectStore("removals").put({ spaceId, ...removal });
          tx.objectStore("entries").delete([spaceId, removal.entryId]);
          tx.objectStore("runs").delete([spaceId, removal.entryId]);
        }
        for (const entry of changed.entries)
          tx.objectStore("entries").put({ spaceId, ...entry });
        for (const run of changed.runs)
          tx.objectStore("runs").put({ spaceId, ...run });
      }),
    getMarkers: async (spaceId) =>
      strip((await one<Stored<Markers>>("markers", spaceId)) ?? { spaceId }),
    patchMarkers: (spaceId, patch) =>
      transact(db, ["markers"], "readwrite", async (tx) => {
        const store = tx.objectStore("markers");
        const next: Stored<Markers> = {
          ...(await request<Stored<Markers> | undefined>(store.get(spaceId))),
          ...patch,
          spaceId,
        };
        store.put(next);
        return strip(next);
      }),
    getPref: async <T>(name: string) =>
      (await one<{ value: T }>("prefs", name))?.value,
    setPref: (name, value) =>
      transact(db, ["prefs"], "readwrite", (tx) => {
        tx.objectStore("prefs").put({ name, value });
      }),
  };
}

/** The same contract with nothing saved: the fallback when the browser
 *  refuses storage, and what unit tests run against. */
export function memoryRecords(): Records {
  const spaces = new Map<string, SpaceMeta>();
  const timelines = new Map<string, TimelineState>();
  const markers = new Map<string, Markers>();
  const prefs = new Map<string, unknown>();
  return {
    listSpaces: async () => [...spaces.values()],
    getSpace: async (id) => spaces.get(id),
    putSpace: async (meta) => void spaces.set(meta.id, meta),
    patchSpace: async (id, patch) => {
      const current = spaces.get(id);
      if (current) spaces.set(id, { ...current, ...patch, id });
    },
    deleteSpace: async (id) => {
      spaces.delete(id);
      timelines.delete(id);
      markers.delete(id);
    },
    loadTimeline: async (spaceId) =>
      structuredClone(toPatch(timelines.get(spaceId) ?? emptyTimeline)),
    mergeTimeline: async (spaceId, patch) => {
      timelines.set(
        spaceId,
        mergeTimeline(
          timelines.get(spaceId) ?? emptyTimeline,
          structuredClone(patch),
        ).state,
      );
    },
    getMarkers: async (spaceId) => ({ ...markers.get(spaceId) }),
    patchMarkers: async (spaceId, patch) => {
      const next = { ...markers.get(spaceId), ...patch };
      markers.set(spaceId, next);
      return { ...next };
    },
    getPref: async <T>(name: string) => prefs.get(name) as T | undefined,
    setPref: async (name, value) => void prefs.set(name, value),
  };
}
