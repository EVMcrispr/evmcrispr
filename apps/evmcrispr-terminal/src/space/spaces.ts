import { displayTitle, head, type SpaceMeta } from "@evmcrispr/space";
import { createStore, type StoreApi } from "zustand/vanilla";
import { type Locks, lockNames, type Release } from "../storage/locks";
import {
  type LiveSpace,
  openLiveSpace,
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
  changes.subscribe((change) => {
    if (change.store === "spaces") void refresh();
  });

  const load = (id: string, init?: SpaceInit): Loaded => {
    const open = async (entry: Loaded) => {
      // Typing left from a previous visit is recorded only by the first
      // tab to open the space: with another tab on it, it is not "left".
      const alone = !(await locks.isHeld(lockNames.open(id)));
      entry.presence = await locks.share(lockNames.open(id));
      const space = await openLiveSpace(id, deps, init);
      // A space with no revision yet is being restored from an export:
      // its text has not arrived, and there is nothing to compare with.
      if (alone && !init && head(space.timeline.getState()))
        space.record("user");
      return space;
    };
    const entry = { holds: 0, pinned: false } as Loaded;
    entry.space = open(entry);
    loaded.set(id, entry);
    return entry;
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
        unreviewed: false,
      });
      const entry = load(id, { ...init, createdAt });
      entry.holds++;
      try {
        await entry.space;
      } catch (error) {
        // Nothing half-made is left listed: the space can be made again.
        loaded.delete(id);
        entry.presence?.();
        await storage.records.deleteSpace(id);
        throw error;
      }
      entry.holds--;
      drop(id);
      changes.announce({ store: "spaces", key: id });
      await refresh();
      return id;
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
      const entry = loaded.get(id);
      if (entry) {
        entry.holds = 0;
        entry.pinned = false;
        loaded.delete(id);
        await (await entry.space).close();
        entry.presence?.();
      }
      if (onScreen.getState() === id) onScreen.setState(null, true);
      await storage.records.deleteSpace(id);
      await storage.deleteDoc(id);
      changes.announce({ store: "spaces", key: id });
    },
  };
}
