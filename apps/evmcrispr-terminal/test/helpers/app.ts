import type { WorkerEvml } from "@evmcrispr/core/worker-client";
import { createStore } from "zustand/vanilla";
import type { App } from "../../src/app/boot";
import { createIdbChatStore } from "../../src/assistant/chat-store";
import { createRunManager, type Wallet } from "../../src/runs/run-manager";
import { createSpaces } from "../../src/space/spaces";
import { tabTransport } from "../../src/space/tab-transport";
import { createChanges } from "../../src/storage/changes";
import { memoryStorage } from "../../src/storage/index";
import {
  type Locks,
  LockTable,
  localLocks,
  type Release,
} from "../../src/storage/locks";
import { fakeEvml } from "./fake-evml";
import { channelHub } from "./tabs";

/** One fake browser. `tab()` builds an App object on its storage, the way
 *  `boot()` does in a real tab. */
export function testBrowser() {
  const storage = memoryStorage();
  const hub = channelHub();
  const table = new LockTable();
  const held = new Map<App, Set<Release>>();
  let clock = 1_000;
  return {
    storage,
    tab(
      options: { evml?: () => WorkerEvml; wallet?: () => Promise<Wallet> } = {},
    ): App {
      // Remembers the locks this tab holds, to let go of them on close.
      const mine = new Set<Release>();
      const inner = localLocks(table);
      const remember = <T extends Release | null>(release: T): T => {
        if (release) mine.add(release);
        return release;
      };
      const locks: Locks = {
        tryHold: async (name) => remember(await inner.tryHold(name)),
        hold: async (name) => remember(await inner.hold(name)),
        share: async (name) => remember(await inner.share(name)),
        isHeld: inner.isHeld,
      };
      const changes = createChanges(hub);
      const now = () => clock++;
      const me = () => ({ kind: "user" }) as const;
      const spaces = createSpaces({
        storage,
        transport: tabTransport(hub),
        changes,
        locks,
        now,
        me,
      });
      const createWorker =
        options.evml ?? (() => fakeEvml([], async () => undefined));
      const runs = createRunManager({
        spaces,
        locks,
        records: storage.records,
        changes,
        now,
        me,
        createWorker,
        cancelGraceMs: 20,
        wallet:
          options.wallet ??
          (async () => ({ client: undefined, address: undefined })),
      });
      const app: App = {
        storage,
        locks,
        changes,
        spaces,
        runs,
        me,
        chats: createIdbChatStore({ records: storage.records, changes }),
        assistantEvml: createWorker,
        outdated: createStore(() => false),
      };
      held.set(app, mine);
      return app;
    },
    /** The tab closes or crashes: the browser releases its locks, and
     *  nothing else is told. */
    closeTab(app: App) {
      for (const release of held.get(app) ?? []) release();
    },
  };
}
