import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import {
  type RevisionEntry,
  type RunRecord,
  revisionId,
  type SpaceMeta,
} from "@evmcrispr/space";
import { openDb } from "../../src/storage/db";
import {
  type ChatRecord,
  idbRecords,
  memoryRecords,
  type Records,
} from "../../src/storage/records";

const meta = (id: string): SpaceMeta => ({
  id,
  title: id,
  createdAt: 1,
  updatedAt: 1,
  unreviewed: false,
});
const entry = (text: string, ts = 1): RevisionEntry => ({
  kind: "revision",
  id: revisionId(text, undefined),
  ts,
  author: { kind: "user" },
  text,
  source: "user",
});
const run = (id: string, updatedAt: number): RunRecord => ({
  id,
  revisionId: "a",
  mode: "real",
  status: "running",
  startedAt: 1,
  by: { kind: "user" },
  console: {},
  errors: [],
  output: "",
  executedCount: 0,
  updatedAt,
});

const backends: [string, () => Promise<Records>][] = [
  ["memory", async () => memoryRecords()],
  ["indexeddb", async () => idbRecords(await openDb(() => {}))],
];

for (const [name, make] of backends)
  describe(`records (${name})`, () => {
    test("spaces: put, patch, list, delete", async () => {
      const r = await make();
      await r.putSpace(meta("s1"));
      await r.patchSpace("s1", { title: "T", run: "paused" });
      await r.patchSpace("missing", { title: "x" });
      expect((await r.getSpace("s1"))!.title).toBe("T");
      expect((await r.listSpaces()).map((s) => s.id)).toContain("s1");
      expect(await r.getSpace("missing")).toBeUndefined();
      await r.mergeTimeline("s1", { entries: [entry("a")] });
      await r.patchMarkers("s1", { approvedText: "a" });
      await r.deleteSpace("s1");
      expect(await r.getSpace("s1")).toBeUndefined();
      expect((await r.loadTimeline("s1")).entries).toEqual([]);
      expect(await r.getMarkers("s1")).toEqual({});
    });
    test("timeline: per space, newer run wins, removal deletes content", async () => {
      const r = await make();
      await r.mergeTimeline("t1", {
        entries: [entry("a"), entry("b", 2)],
        runs: [run("x", 5)],
      });
      await r.mergeTimeline("t2", { entries: [entry("a")] });
      await r.mergeTimeline("t1", { runs: [run("x", 3)] });
      await r.mergeTimeline("t1", {
        removals: [{ entryId: entry("a").id, by: { kind: "user" }, ts: 9 }],
      });
      await r.mergeTimeline("t1", { entries: [entry("a")] });
      const t1 = await r.loadTimeline("t1");
      expect(t1.entries!.map((e) => e.id)).toEqual([entry("b").id]);
      expect(t1.runs![0].updatedAt).toBe(5);
      expect(t1.removals!.length).toBe(1);
      expect((await r.loadTimeline("t2")).entries!.length).toBe(1);
      expect("spaceId" in t1.entries![0]).toBe(false);
    });
    test("markers and prefs", async () => {
      const r = await make();
      expect(await r.getMarkers("m1")).toEqual({});
      await r.patchMarkers("m1", { approvedText: "a" });
      expect(await r.patchMarkers("m1", { hiddenBefore: 3 })).toEqual({
        approvedText: "a",
        hiddenBefore: 3,
      });
      await r.setPref("lastChatId", "c1");
      expect(await r.getPref<string>("lastChatId")).toBe("c1");
      expect(await r.getPref("nope")).toBeUndefined();
    });
    test("chats: put, get, list, replace, delete", async () => {
      const r = await make();
      const chat = (id: string, title: string): ChatRecord => ({
        id,
        meta: {
          id,
          title,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        chat: { id, items: [{ role: "user", text: title }], messages: [] },
      });
      await r.putChat(chat("c1", "one"));
      await r.putChat(chat("c2", "two"));
      await r.putChat(chat("c1", "one again"));
      expect((await r.listChats()).map((c) => c.meta.title).sort()).toEqual([
        "one again",
        "two",
      ]);
      expect((await r.getChat("c1"))?.chat.items[0].text).toBe("one again");
      await r.deleteChat("c2");
      expect((await r.listChats()).length).toBe(1);
      expect(await r.getChat("c2")).toBeUndefined();
    });
    test("two additions from two connections lose neither", async () => {
      const [a, b] = [await make(), name === "memory" ? null : await make()];
      if (!b) return;
      await Promise.all([a.putSpace(meta("p1")), b.putSpace(meta("p2"))]);
      expect((await a.listSpaces()).map((s) => s.id)).toEqual(
        expect.arrayContaining(["p1", "p2"]),
      );
    });
  });
