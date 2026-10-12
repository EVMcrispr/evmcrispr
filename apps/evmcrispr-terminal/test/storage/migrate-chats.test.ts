import { expect, test } from "bun:test";
import { LockTable, localLocks } from "../../src/storage/locks";
import { migrateChats } from "../../src/storage/migrate";
import { memoryRecords } from "../../src/storage/records";
import { local } from "../helpers/local";

const SPACE = "5b0c1e0e-1111-4111-8111-111111111111";
const meta = (id: string, scopeId?: string) => ({
  id,
  title: `Chat ${id}`,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-03-04T00:00:00.000Z",
  ...(scopeId ? { scopeId } : {}),
});
const payload = (id: string) =>
  JSON.stringify({
    id,
    items: [{ role: "user", text: `hello from ${id}` }],
    messages: [{ role: "user", content: `hello from ${id}` }],
  });

/** Chats as `createChatStore()` of @evmcrispr/ai writes them. */
const fixture = () => ({
  "evmcrispr:chats": JSON.stringify([
    meta("c1", SPACE),
    meta("c2", SPACE),
    meta("c3"),
  ]),
  "evmcrispr:chat:c1": payload("c1"),
  "evmcrispr:chat:c2": payload("c2"),
  "evmcrispr:chat:c3": payload("c3"),
});

const setup = (initial: Record<string, string>) => {
  const store = local(initial);
  const records = memoryRecords();
  const run = (persistent = true) =>
    migrateChats({
      records,
      locks: localLocks(new LockTable()),
      local: store,
      persistent,
    });
  return { store, records, run };
};

test("several chats of one script are all kept, each labelled with the space it started in", async () => {
  const t = setup(fixture());
  await t.run();
  const chats = await t.records.listChats();
  expect(chats.map((c) => c.id).sort()).toEqual(["c1", "c2", "c3"]);
  expect((await t.records.getChat("c1"))?.meta.scopeId).toBe(SPACE);
  expect((await t.records.getChat("c2"))?.meta.scopeId).toBe(SPACE);
  expect((await t.records.getChat("c1"))?.chat).toEqual(
    JSON.parse(payload("c1")),
  );
  expect((await t.records.getChat("c1"))?.meta).toEqual(meta("c1", SPACE));
});

test("a chat with no script is kept without a label", async () => {
  const t = setup(fixture());
  await t.run();
  const chat = await t.records.getChat("c3");
  expect(chat?.chat.items).toHaveLength(1);
  expect(chat?.meta.scopeId).toBeUndefined();
});

test("a chat whose payload is missing or unreadable is skipped, the others proceed, and the flag waits", async () => {
  const t = setup({
    ...fixture(),
    "evmcrispr:chats": JSON.stringify([
      meta("gone"),
      meta("c1", SPACE),
      meta("broken"),
      { title: "no id" },
      null,
    ]),
    "evmcrispr:chat:broken": "{not json",
  });
  await t.run();
  expect((await t.records.listChats()).map((c) => c.id)).toEqual(["c1"]);
  expect(t.store.getItem("evmcrispr:migrated:chats")).toBeNull();
});

test("old storage is left byte-for-byte unchanged", async () => {
  const before = fixture();
  const t = setup(before);
  await t.run();
  const { "evmcrispr:migrated:chats": flag, ...rest } = Object.fromEntries(
    t.store.data,
  );
  expect(flag).toBe("1");
  expect(rest).toEqual(before);
});

test("a second run is a no-op, and never overwrites a chat that moved on", async () => {
  const t = setup(fixture());
  await t.run();
  const moved = (await t.records.getChat("c1"))!;
  await t.records.putChat({
    ...moved,
    chat: { ...moved.chat, items: [] },
  });
  await t.run();
  t.store.data.delete("evmcrispr:migrated:chats");
  await t.run();
  expect((await t.records.getChat("c1"))?.chat.items).toEqual([]);
  expect(await t.records.listChats()).toHaveLength(3);
});

test("with nothing stored there is nothing to do", async () => {
  const t = setup({});
  await t.run();
  expect(await t.records.listChats()).toEqual([]);
  expect(t.store.getItem("evmcrispr:migrated:chats")).toBe("1");
});

test("in a browser that refused storage the flag waits for one that keeps them", async () => {
  const t = setup(fixture());
  await t.run(false);
  expect(await t.records.listChats()).toHaveLength(3);
  expect(t.store.getItem("evmcrispr:migrated:chats")).toBeNull();
});
