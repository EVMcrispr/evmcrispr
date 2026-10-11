import type { Author } from "@evmcrispr/space";
import { getConnection } from "@wagmi/core";
import { createStore, type StoreApi } from "zustand/vanilla";
import { config as wagmiConfig } from "../config/wagmi";
import { createSpaces, type Spaces } from "../space/spaces";
import { tabTransport } from "../space/tab-transport";
import { type Changes, createChanges } from "../storage/changes";
import { openBroadcastChannel, openSilentChannel } from "../storage/channel";
import { openStorage, type Storage } from "../storage/index";
import { type Locks, localLocks, webLocks } from "../storage/locks";
import { migrate } from "../storage/migrate";

/** Everything the app shares, built once. React reads it from
 *  `<AppProvider>`; the rest receives what it needs as a parameter. */
export interface App {
  storage: Storage;
  locks: Locks;
  changes: Changes;
  spaces: Spaces;
  /** A newer version of the app took the database: this tab must reload. */
  outdated: StoreApi<boolean>;
}

function me(): Author {
  const { address } = getConnection(wagmiConfig);
  return address ? { kind: "user", address } : { kind: "user" };
}

export async function boot(): Promise<App> {
  const outdated = createStore(() => false);
  const storage = await openStorage(() => outdated.setState(true, true));
  // Without BroadcastChannel or Web Locks the browser has one tab as far
  // as the app can tell: it talks to nobody and holds every lock.
  const open =
    typeof BroadcastChannel === "function"
      ? openBroadcastChannel
      : openSilentChannel;
  const locks = navigator.locks ? webLocks(navigator.locks) : localLocks();
  const changes = createChanges(open);
  const spaces = createSpaces({
    storage,
    transport: tabTransport(open),
    changes,
    locks,
    now: Date.now,
    me,
  });
  await migrate({
    spaces,
    records: storage.records,
    locks,
    local: localStorage,
    persistent: storage.persistent,
  });
  await spaces.ready;
  if (storage.persistent && navigator.storage?.persist)
    askToPersist(spaces, () => navigator.storage.persist());
  return { storage, locks, changes, spaces, outdated };
}

/** Asks the browser not to evict storage, once per page, when a space has
 *  been written to after it was made. Not at the first load: Firefox asks
 *  the person, and a question before they have typed anything is noise. */
export function askToPersist(
  spaces: Spaces,
  persist: () => Promise<boolean>,
): void {
  const stop = spaces.index.subscribe((list) => {
    if (!list.some((meta) => meta.updatedAt > meta.createdAt)) return;
    stop();
    void persist().catch(() => false);
  });
}
