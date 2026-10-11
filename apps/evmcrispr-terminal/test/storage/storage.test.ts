import "fake-indexeddb/auto";
import { expect, test } from "bun:test";
import * as Y from "yjs";
import { type Change, createChanges } from "../../src/storage/changes";
import { openBroadcastChannel } from "../../src/storage/channel";
import { memoryStorage, openStorage } from "../../src/storage/index";

test("a document survives being closed and reopened", async () => {
  for (const storage of [await openStorage(() => {}), memoryStorage()]) {
    const first = new Y.Doc();
    const one = await storage.persistDoc("s1", first);
    first.getText("script").insert(0, "exec 1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await one.stop();
    const second = new Y.Doc();
    await storage.persistDoc("s1", second);
    expect(second.getText("script").toString()).toBe("exec 1");
    await storage.deleteDoc("s1");
  }
});

test("falls back to memory when IndexedDB cannot be opened", async () => {
  const real = globalThis.indexedDB;
  // What a private window or a blocked frame does.
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    get() {
      throw new DOMException("denied", "SecurityError");
    },
  });
  try {
    const storage = await openStorage(() => {});
    expect(storage.persistent).toBe(false);
    await storage.records.setPref("x", 1);
    expect(await storage.records.getPref<number>("x")).toBe(1);
  } finally {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: real,
      writable: true,
    });
  }
});

test("a change is announced to this tab and to the others", async () => {
  const [a, b] = [
    createChanges(openBroadcastChannel),
    createChanges(openBroadcastChannel),
  ];
  const seen: string[] = [];
  const note = (tab: string) => (c: Change, local: boolean) =>
    seen.push(`${tab}:${c.store}:${c.key}:${local ? "local" : "remote"}`);
  a.subscribe(note("a"));
  b.subscribe(note("b"));
  a.announce({ store: "spaces", key: "s1" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(seen.sort()).toEqual(["a:spaces:s1:local", "b:spaces:s1:remote"]);
});
