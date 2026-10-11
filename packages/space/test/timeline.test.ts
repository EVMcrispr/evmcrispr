import { describe, expect, test } from "bun:test";
import { revisionId } from "../src/hash";
import {
  head,
  MAX_REVISIONS,
  nextRevision,
  pruneRevisions,
  shareOf,
} from "../src/revisions";
import {
  emptyTimeline,
  mergeTimeline,
  orderedEntries,
  type TimelineState,
} from "../src/timeline";
import type {
  Author,
  RevisionEntry,
  RunRecord,
  ShareEntry,
  TimelineEntry,
} from "../src/types";

const me: Author = { kind: "user" };
const bot: Author = { kind: "assistant" };

const rev = (
  state: TimelineState,
  text: string,
  source: RevisionEntry["source"],
  ts: number,
  author: Author = source === "assistant" ? bot : me,
) => nextRevision(state, text, { source, author, ts })!;
const add = (state: TimelineState, ...entries: TimelineEntry[]) =>
  mergeTimeline(state, { entries }).state;
const run = (id: string, updatedAt: number, revisionId = "r"): RunRecord => ({
  id,
  revisionId,
  mode: "real",
  status: "running",
  startedAt: 1,
  by: me,
  console: null,
  errors: [],
  output: "",
  executedCount: 0,
  updatedAt,
});
const share = (revisionId: string, cid: string, ts = 9): ShareEntry => ({
  kind: "share",
  id: `share:${cid}`,
  revisionId,
  cid,
  key: "k",
  ts,
  author: me,
});

describe("timeline", () => {
  test("entries union, idempotent", () => {
    const a = rev(emptyTimeline, "a", "user", 1);
    const one = mergeTimeline(emptyTimeline, { entries: [a] });
    expect(one.changed.entries).toEqual([a]);
    const two = mergeTimeline(one.state, { entries: [a] });
    expect(two.state).toBe(one.state);
    expect(two.changed.entries).toEqual([]);
  });
  test("newer run wins in either order", () => {
    const s1 = mergeTimeline(
      mergeTimeline(emptyTimeline, { runs: [run("x", 1)] }).state,
      { runs: [run("x", 2)] },
    ).state;
    const s2 = mergeTimeline(
      mergeTimeline(emptyTimeline, { runs: [run("x", 2)] }).state,
      { runs: [run("x", 1)] },
    ).state;
    expect(s1.runs.get("x")!.updatedAt).toBe(2);
    expect(s2.runs.get("x")!.updatedAt).toBe(2);
  });
  test("a removal beats an entry in either order", () => {
    const a = rev(emptyTimeline, "secret", "user", 1);
    const removal = { entryId: a.id, by: me, ts: 2 };
    const first = mergeTimeline(
      mergeTimeline(emptyTimeline, { entries: [a] }).state,
      { removals: [removal] },
    ).state;
    const second = mergeTimeline(
      mergeTimeline(emptyTimeline, { removals: [removal] }).state,
      { entries: [a] },
    ).state;
    expect(first.entries.size).toBe(0);
    expect(second.entries.size).toBe(0);
    expect(second.removals.has(a.id)).toBe(true);
  });
  test("a removed run entry takes its record", () => {
    const s = mergeTimeline(emptyTimeline, {
      runs: [run("x", 1)],
      entries: [{ kind: "run", id: "x", runId: "x", ts: 1, author: me }],
    }).state;
    const gone = mergeTimeline(s, {
      removals: [{ entryId: "x", by: me, ts: 2 }],
    }).state;
    expect(gone.runs.size).toBe(0);
    expect(mergeTimeline(gone, { runs: [run("x", 9)] }).state.runs.size).toBe(
      0,
    );
  });
  test("an entry is never rewritten", () => {
    const a = rev(emptyTimeline, "a", "user", 1);
    const s = add(emptyTimeline, a);
    const again = mergeTimeline(s, {
      entries: [{ ...a, summary: "rewritten" }],
    });
    expect(again.state).toBe(s);
    expect(again.changed.entries).toEqual([]);
  });
  test("a revision whose id is not the hash of its text and parent is dropped", () => {
    const a = rev(emptyTimeline, "a", "user", 1);
    const s = add(emptyTimeline, a);
    const b = rev(s, "b", "user", 2);
    const forged = mergeTimeline(s, {
      entries: [
        { ...b, text: "not what was hashed" },
        { ...b, id: "made-up" },
        { ...b, parent: undefined },
      ],
    });
    expect(forged.state).toBe(s);
    expect(forged.changed.entries).toEqual([]);
    expect(mergeTimeline(s, { entries: [b] }).changed.entries).toEqual([b]);
  });
  test("a share is its own entry, found by the revision it names", () => {
    const a = rev(emptyTimeline, "a", "user", 1);
    const s = add(emptyTimeline, a);
    expect(shareOf(s, a.id)).toBeUndefined();
    const shared = add(s, share(a.id, "c1", 5), share(a.id, "c2", 6));
    expect(shared.entries.get(a.id)).toBe(a);
    expect(shareOf(shared, a.id)?.cid).toBe("c1");
    expect(orderedEntries(shared).map((e) => e.kind)).toEqual([
      "revision",
      "share",
      "share",
    ]);
  });
});

describe("revisions", () => {
  test("no-op when unchanged, same state twice is one entry", () => {
    const a = rev(emptyTimeline, "a", "user", 1);
    const s = add(emptyTimeline, a);
    expect(
      nextRevision(s, "a", { source: "user", author: me, ts: 2 }),
    ).toBeNull();
    const b1 = rev(s, "b", "user", 2);
    const b2 = rev(s, "b", "user", 3);
    expect(b1.id).toBe(b2.id);
    expect(b1.id).toBe(revisionId("b", a.id));
    expect(add(add(s, b1), b2).entries.size).toBe(2);
    expect(head(add(s, b1))!.id).toBe(b1.id);
  });
  test("same text after going back gets a new id", () => {
    let s = add(emptyTimeline, rev(emptyTimeline, "a", "user", 1));
    s = add(s, rev(s, "b", "user", 2));
    const back = rev(s, "a", "load", 3);
    expect(back.id).not.toBe(orderedEntries(s)[0].id);
  });
  test("the cap spares pinned revisions", () => {
    let s = emptyTimeline;
    const ids: string[] = [];
    for (let i = 0; i < MAX_REVISIONS + 5; i++) {
      const r = rev(s, `v${i}`, "user", i);
      ids.push(r.id);
      s = add(s, r);
    }
    s = mergeTimeline(s, { runs: [run("x", 1, ids[0])] }).state;
    s = add(s, share(ids[1], "c", 999));
    const removals = pruneRevisions(s, me, 999);
    expect(removals.map((r) => r.entryId)).toEqual([ids[2], ids[3], ids[4]]);
  });
});
