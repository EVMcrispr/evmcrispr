import { expect, test } from "bun:test";
import type { ChatItem } from "@evmcrispr/ai";
import { createIdbChatStore } from "../../src/assistant/chat-store";
import { createChanges } from "../../src/storage/changes";
import { memoryRecords, type Records } from "../../src/storage/records";
import { channelHub, settle } from "../helpers/tabs";

const said = (text: string): ChatItem[] => [{ role: "user", text }];

/** One fake browser: every `tab()` is a chat store on the same storage. */
function browser(records: Records = memoryRecords()) {
  const hub = channelHub();
  return {
    records,
    tab: async () => {
      const store = createIdbChatStore({
        records,
        changes: createChanges(hub),
      });
      await store.ready;
      return store;
    },
  };
}

test("hydrates from storage, most recently updated first", async () => {
  const b = browser();
  const record = (id: string, updatedAt: string) => ({
    id,
    meta: { id, title: id, createdAt: updatedAt, updatedAt },
    chat: { id, items: said(id), messages: [] },
  });
  await b.records.putChat(record("old", "2026-01-01T00:00:00.000Z"));
  await b.records.putChat(record("new", "2026-02-01T00:00:00.000Z"));
  const store = await b.tab();
  expect(store.listChats().map((c) => c.id)).toEqual(["new", "old"]);
  expect(store.getChat("old")?.items).toEqual(said("old"));
  expect(store.getChat("nope")).toBeNull();
});

test("saveChat is visible at once and reaches storage behind", async () => {
  const b = browser();
  const store = await b.tab();
  store.saveChat("c1", "Hello", said("Hello"), [], "space-1");
  expect(store.getChat("c1")?.items.length).toBe(1);
  expect(store.listChats()[0]).toMatchObject({
    id: "c1",
    title: "Hello",
    scopeId: "space-1",
  });
  expect(await b.records.listChats()).toEqual([]);
  await store.flushed();
  expect((await b.records.listChats())[0].chat.items.length).toBe(1);
});

test("keeps more than 20 chats", async () => {
  const b = browser();
  const store = await b.tab();
  for (let i = 0; i < 30; i++) store.saveChat(`c${i}`, `${i}`, said("x"), []);
  expect(store.listChats().length).toBe(30);
  await store.flushed();
  expect((await b.records.listChats()).length).toBe(30);
  expect((await b.tab()).listChats().length).toBe(30);
});

test("writes behind: many saves of one chat are few writes, and the last one wins", async () => {
  const records = memoryRecords();
  let puts = 0;
  const b = browser({
    ...records,
    putChat: (record) => {
      puts++;
      return records.putChat(record);
    },
  });
  const store = await b.tab();
  for (let i = 0; i < 50; i++) store.saveChat("c1", "t", said(`${i}`), []);
  await store.flushed();
  expect(puts).toBeLessThanOrEqual(2);
  expect((await records.getChat("c1"))?.chat.items).toEqual(said("49"));
});

test("a write that fails does not stop the ones after it", async () => {
  const records = memoryRecords();
  let fail = true;
  const b = browser({
    ...records,
    putChat: async (record) => {
      if (fail) throw new Error("full");
      await records.putChat(record);
    },
  });
  const store = await b.tab();
  store.saveChat("c1", "t", said("one"), []);
  await store.flushed();
  fail = false;
  store.saveChat("c2", "t", said("two"), []);
  await store.flushed();
  expect((await records.listChats()).map((c) => c.id)).toEqual(["c2"]);
  // Nothing was dropped from memory to make room.
  expect(store.listChats().length).toBe(2);
});

test("the label is the space a chat started in and does not move", async () => {
  const store = await browser().tab();
  store.saveChat("c1", "t", said("a"), [], "space-1");
  store.saveChat("c1", "t", said("b"), [], "space-2");
  store.saveChat("c1", "t", said("c"), []);
  expect(store.listChats()[0].scopeId).toBe("space-1");
});

test("getChat returns the same object until the chat changes, and the list too", async () => {
  const store = await browser().tab();
  store.saveChat("c1", "t", said("a"), []);
  expect(store.getChat("c1")).toBe(store.getChat("c1"));
  expect(store.listChats()).toBe(store.listChats());
  const before = store.getChat("c1");
  store.saveChat("c1", "t", said("b"), []);
  expect(store.getChat("c1")).not.toBe(before);
});

test("removeChat removes it everywhere", async () => {
  const b = browser();
  const store = await b.tab();
  store.saveChat("c1", "t", said("a"), []);
  await store.flushed();
  store.removeChat("c1");
  expect(store.getChat("c1")).toBeNull();
  expect(store.listChats()).toEqual([]);
  await store.flushed();
  expect(await b.records.listChats()).toEqual([]);
});

test("a chat saved or removed in another tab follows here, and subscribers are told", async () => {
  const b = browser();
  const [one, two] = [await b.tab(), await b.tab()];
  let told = 0;
  two.subscribe(() => told++);
  one.saveChat("c1", "From one", said("hi"), [], "space-1");
  await one.flushed();
  await settle();
  expect(told).toBeGreaterThan(0);
  expect(two.getChat("c1")?.items).toEqual(said("hi"));
  expect(two.listChats()[0].title).toBe("From one");

  one.removeChat("c1");
  await one.flushed();
  await settle();
  expect(two.getChat("c1")).toBeNull();
});

test("refresh reads a chat again from storage", async () => {
  const b = browser();
  const [one, two] = [await b.tab(), await b.tab()];
  one.saveChat("c1", "t", said("hi"), []);
  await one.flushed();
  // Before the announcement arrives.
  await two.refresh("c1");
  expect(two.getChat("c1")?.items).toEqual(said("hi"));
});

test("the last chat is remembered across stores", async () => {
  const b = browser();
  const store = await b.tab();
  expect(store.getLastChatId()).toBeUndefined();
  store.setLastChatId("c7");
  expect(store.getLastChatId()).toBe("c7");
  await store.flushed();
  expect((await b.tab()).getLastChatId()).toBe("c7");
});

test("what a chat took in and was allowed stays with it: across saves, tabs and reloads", async () => {
  const b = browser();
  const [one, two] = [await b.tab(), await b.tab()];
  expect(one.getPermissions("c1")).toBeUndefined();
  one.grant("c1", { edit: "B" });
  expect(one.getPermissions("c1")).toBeUndefined();

  one.saveChat("c1", "t", said("a"), []);
  const chat = one.getChat("c1");
  expect(one.getPermissions("c1")).toEqual({ read: [], web: false, edit: [] });
  one.grant("c1", { edit: "B" });
  one.grant("c1", { edit: "B" });
  one.grant("c1", { webWithSpaces: false });
  // Noting what was taken in leaves the answers alone.
  one.noteTaken("c1", { read: ["A"], web: true });
  const expected = {
    read: ["A"],
    web: true,
    edit: ["B"],
    webWithSpaces: false,
  };
  expect(one.getPermissions("c1")).toEqual(expected);
  expect(one.getPermissions("c1")).toBe(one.getPermissions("c1"));
  // The chat itself did not change.
  expect(one.getChat("c1")).toBe(chat);

  one.saveChat("c1", "t", said("b"), []);
  expect(one.getPermissions("c1")).toEqual(expected);
  await one.flushed();
  await settle();
  expect(two.getPermissions("c1")).toEqual(expected);
  expect((await b.tab()).getPermissions("c1")).toEqual(expected);

  one.removeChat("c1");
  expect(one.getPermissions("c1")).toBeUndefined();
});

test("an answer given in one tab reaches the other, and is not lost when that one saves the chat", async () => {
  const b = browser();
  const [one, two] = [await b.tab(), await b.tab()];
  one.saveChat("c1", "t", said("a"), []);
  one.noteTaken("c1", { read: ["A"], web: false });
  await one.flushed();
  await settle();
  const chat = one.getChat("c1");

  two.grant("c1", { edit: "B" });
  two.noteTaken("c1", { read: ["A", "C"], web: true });
  await two.flushed();
  await settle();
  expect(one.getPermissions("c1")).toEqual({
    read: ["A", "C"],
    web: true,
    edit: ["B"],
  });
  // Only what goes with the chat changed.
  expect(one.getChat("c1")).toBe(chat);

  one.saveChat("c1", "t", said("b"), []);
  await one.flushed();
  await settle();
  expect(two.getPermissions("c1")?.edit).toEqual(["B"]);
  expect((await b.records.getChat("c1"))?.permissions?.edit).toEqual(["B"]);
});

test("before the announcement arrives, refresh brings the other tab's answer", async () => {
  const b = browser();
  const [one, two] = [await b.tab(), await b.tab()];
  one.saveChat("c1", "t", said("a"), []);
  await one.flushed();
  await settle();
  two.grant("c1", { webWithSpaces: true });
  await two.flushed();
  await one.refresh("c1");
  expect(one.getPermissions("c1")?.webWithSpaces).toBe(true);
});
