import { createStore } from "zustand/vanilla";
import type { App } from "../../src/app/boot";
import { createSpaces } from "../../src/space/spaces";
import { tabTransport } from "../../src/space/tab-transport";
import { createChanges } from "../../src/storage/changes";
import { memoryStorage } from "../../src/storage/index";
import { LockTable, localLocks } from "../../src/storage/locks";
import { channelHub } from "./tabs";

/** One fake browser. `tab()` builds an App object on its storage, the way
 *  `boot()` does in a real tab. */
export function testBrowser() {
  const storage = memoryStorage();
  const hub = channelHub();
  const table = new LockTable();
  let clock = 1_000;
  return {
    storage,
    tab(): App {
      const locks = localLocks(table);
      const changes = createChanges(hub);
      const spaces = createSpaces({
        storage,
        transport: tabTransport(hub),
        changes,
        locks,
        now: () => clock++,
        me: () => ({ kind: "user" }),
      });
      return {
        storage,
        locks,
        changes,
        spaces,
        outdated: createStore(() => false),
      };
    },
  };
}
