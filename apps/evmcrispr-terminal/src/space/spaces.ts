import { displayTitle, head, type SpaceMeta } from "@evmcrispr/space";
import { createStore, type StoreApi } from "zustand/vanilla";
import { type Locks, lockNames, type Release } from "../storage/locks";
import {
  type LiveSpace,
  openLiveSpace,
  type SpaceCopy,
  type SpaceDeps,
  type SpaceInit,
} from "./live-space";

export interface Spaces {
  /** Every space of this browser, last changed first. */
  readonly index: StoreApi<SpaceMeta[]>;
  /** The space this tab shows. */
  readonly onScreen: StoreApi<string | null>;
  /** Resolves once `index` has been read from storage. */
  readonly ready: Promise<void>;
  create(init: SpaceInit, id?: string): Promise<string>;
  /** Brings in a space this browser does not have, under the id its
   *  export names, approved as it arrives. False, with nothing touched,
   *  when a space of that id is here: that would be a merge into it, which
   *  the user is asked about first (`LiveSpace.mergeCopy`). */
  restore(id: string, copy: SpaceCopy): Promise<boolean>;
  /** Loads a space, or returns it if loaded, and keeps it until `release`. */
  acquire(id: string): Promise<LiveSpace | null>;
  release(id: string): void;
  /** Puts a space on screen. A space that was on screen stays loaded while
   *  the page is open, so its undo history survives going elsewhere. */
  show(id: string | null): void;
  remove(id: string): Promise<void>;
}

interface Loaded {
  space: Promise<LiveSpace>;
  holds: number;
  pinned: boolean;
  presence?: Release;
}

export function createSpaces(deps: SpaceDeps & { locks: Locks }): Spaces {
  const { storage, changes, locks } = deps;
  const index = createStore<SpaceMeta[]>(() => []);
  const onScreen = createStore<string | null>(() => null);
  const loaded = new Map<string, Loaded>();

  const refresh = async () =>
    index.setState(
      (await storage.records.listSpaces()).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
      true,
    );
  const ready = refresh();

  /** Lets go of a loaded space whatever holds it, without touching what
   *  is stored. Whoever still has the object can read it; it writes
   *  nothing any more. */
  const close = async (id: string) => {
    const entry = loaded.get(id);
    if (onScreen.getState() === id) onScreen.setState(null, true);
    if (!entry) return;
    loaded.delete(id);
    await (await entry.space).close().catch(() => {});
    entry.presence?.();
  };

  changes.subscribe(async (change, local) => {
    if (change.store !== "spaces") return;
    // Removed in another tab: it is closed here too, or this tab would
    // keep writing to a space that is gone.
    if (
      !local &&
      loaded.has(change.key) &&
      !(await storage.records.getSpace(change.key))
    )
      await close(change.key);
    void refresh();
  });

  const load = (id: string, init?: SpaceInit | { copy: SpaceCopy }): Loaded => {
    const open = async (entry: Loaded) => {
      // Typing left from a previous visit is recorded only by the first
      // tab to open the space: with another tab on it, it is not "left".
      const alone = !(await locks.isHeld(lockNames.open(id)));
      entry.presence = await locks.share(lockNames.open(id));
      const space = await openLiveSpace(id, deps, init);
      // A space with no revision yet was not finished being made: there
      // is nothing to compare its text with.
      if (alone && !init && head(space.timeline.getState()))
        space.record("user");
      return space;
    };
    const entry = { holds: 0, pinned: false } as Loaded;
    entry.space = open(entry);
    loaded.set(id, entry);
    return entry;
  };

  /** Loads a space that was just listed, for the first time. */
  const make = async (id: string, init: SpaceInit | { copy: SpaceCopy }) => {
    const entry = load(id, init);
    entry.holds++;
    try {
      await entry.space;
    } catch (error) {
      // Nothing half-made is left, listed or stored: the space can be
      // made again.
      loaded.delete(id);
      entry.presence?.();
      await storage.records.deleteSpace(id);
      await storage.deleteDoc(id).catch(() => {});
      throw error;
    }
    entry.holds--;
    drop(id);
    changes.announce({ store: "spaces", key: id });
    await refresh();
  };

  const drop = (id: string) => {
    const entry = loaded.get(id);
    if (!entry || entry.holds > 0 || entry.pinned) return;
    loaded.delete(id);
    void entry.space
      .then((space) => space.close())
      .finally(() => entry.presence?.());
  };

  return {
    index,
    onScreen,
    ready,
    async create(init, id = crypto.randomUUID()) {
      const createdAt = init.createdAt ?? deps.now();
      await storage.records.putSpace({
        id,
        title: displayTitle(init.text),
        createdAt,
        updatedAt: init.ts ?? createdAt,
        unreviewed: init.unreviewed === true,
      });
      await make(id, { ...init, createdAt });
      return id;
    },
    async restore(id, copy) {
      const at = deps.now();
      // Listed only if no space has the id, in one step: whether this is
      // a new space is not asked now and acted on later.
      const added = await storage.records.addSpace({
        id,
        title: displayTitle(copy.script),
        createdAt: at,
        updatedAt: at,
        // Until its script is approved on arriving.
        unreviewed: true,
      });
      if (added) await make(id, { copy });
      return added;
    },
    async acquire(id) {
      let entry = loaded.get(id);
      if (!entry) {
        if (!(await storage.records.getSpace(id))) return null;
        entry = loaded.get(id) ?? load(id);
      }
      entry.holds++;
      return entry.space;
    },
    release(id) {
      const entry = loaded.get(id);
      if (!entry) return;
      entry.holds = Math.max(0, entry.holds - 1);
      drop(id);
    },
    show(id) {
      const entry = id ? loaded.get(id) : undefined;
      if (entry) entry.pinned = true;
      onScreen.setState(id, true);
    },
    async remove(id) {
      await close(id);
      await storage.records.deleteSpace(id);
      await storage.deleteDoc(id);
      changes.announce({ store: "spaces", key: id });
    },
  };
}
