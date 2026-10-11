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
  test("what was recorded here replaces an unverified entry of the same id, never the reverse", () => {
    const mine = rev(emptyTimeline, "a", "user", 5);
    const theirs: RevisionEntry = {
      ...mine,
      ts: 1,
      summary: "not what the user said",
      unverified: true,
    };
    // The export got there first: the user's own record takes its place.
    const squatted = mergeTimeline(emptyTimeline, { entries: [theirs] }).state;
    const taken = mergeTimeline(squatted, { entries: [mine] });
    expect(taken.state.entries.get(mine.id)).toEqual(mine);
    expect(taken.changed.entries).toEqual([mine]);
    // The user's record is there: an export changes nothing of it.
    const kept = mergeTimeline(taken.state, { entries: [theirs] });
    expect(kept.state.entries.get(mine.id)).toEqual(mine);
    expect(kept.changed.entries).toEqual([]);
    // Two unverified ones: the first stays.
    const again = mergeTimeline(squatted, {
      entries: [{ ...theirs, summary: "another" }],
    });
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
  test("what an export brought is never the head: recording goes on from what was recorded here", () => {
    const mine = rev(emptyTimeline, "a", "user", 1);
    const theirs: RevisionEntry = {
      kind: "revision",
      id: revisionId("z", mine.id),
      parent: mine.id,
      text: "z",
      source: "user",
      author: me,
      ts: 99,
      unverified: true,
    };
    const state = mergeTimeline(emptyTimeline, {
      entries: [mine, theirs],
    }).state;
    expect(head(state)?.id).toBe(mine.id);
    // The text the export holds a revision for: the user's own record of
    // it has the same id, and takes its place.
    const next = nextRevision(state, "z", {
      source: "user",
      author: me,
      ts: 5,
    });
    expect(next?.id).toBe(theirs.id);
    const after = mergeTimeline(state, { entries: [next as RevisionEntry] });
    expect(after.state.entries.get(theirs.id)).toEqual(next as RevisionEntry);
    expect(
      head(mergeTimeline(emptyTimeline, { entries: [theirs] }).state),
    ).toBe(undefined);
  });

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

  test("what an export brought never counts against, or displaces, what was recorded here", () => {
    let s = emptyTimeline;
    const mine: string[] = [];
    for (let i = 0; i < MAX_REVISIONS - 2; i++) {
      const r = rev(s, `v${i}`, "user", i);
      mine.push(r.id);
      s = add(s, r);
    }
    // More than the cap, all dated later than anything local.
    const theirs = Array.from({ length: MAX_REVISIONS + 50 }, (_, i) => ({
      kind: "revision" as const,
      id: revisionId(`t${i}`, undefined),
      text: `t${i}`,
      source: "user" as const,
      author: me,
      ts: 10_000 + i,
      unverified: true as const,
    }));
    s = mergeTimeline(s, { entries: theirs }).state;
    expect(pruneRevisions(s, me, 99_999)).toEqual([]);
    // Local ones alone past the cap: the oldest local ones go, and only
    // local ones, whatever an unverified run or a later time says.
    for (let i = 0; i < 5; i++) {
      const r = rev(s, `w${i}`, "user", 20_000 + i);
      mine.push(r.id);
      s = add(s, r);
    }
    s = mergeTimeline(s, {
      runs: [{ ...run("far", 1, theirs[0].id), unverified: true }],
    }).state;
    expect(pruneRevisions(s, me, 99_999).map((r) => r.entryId)).toEqual(
      mine.slice(0, 3),
    );
  });

  test("an unverified run never replaces one recorded here; a removal of an unverified entry does not keep the user's own from being recorded", () => {
    const local = run("r", 5);
    let s = mergeTimeline(emptyTimeline, { runs: [local] }).state;
    s = mergeTimeline(s, {
      runs: [{ ...local, output: "theirs", updatedAt: 999, unverified: true }],
    }).state;
    expect(s.runs.get("r")).toEqual(local);

    const mine = rev(emptyTimeline, "a", "user", 5);
    const theirs: RevisionEntry = { ...mine, unverified: true };
    let t = mergeTimeline(emptyTimeline, { entries: [theirs] }).state;
    t = mergeTimeline(t, {
      removals: [{ entryId: mine.id, by: me, ts: 6, unverified: true }],
    }).state;
    expect(t.entries.has(mine.id)).toBe(false);
    // The export's entry stays gone if it comes again.
    expect(
      mergeTimeline(t, { entries: [theirs] }).state.entries.has(mine.id),
    ).toBe(false);
    // The user's own record of that state is kept, in either order.
    expect(
      mergeTimeline(t, { entries: [mine] }).state.entries.get(mine.id),
    ).toEqual(mine);
    const loaded = mergeTimeline(emptyTimeline, {
      entries: [mine],
      removals: [{ entryId: mine.id, by: me, ts: 6, unverified: true }],
    }).state;
    expect(loaded.entries.get(mine.id)).toEqual(mine);
    // An ordinary removal still removes it.
    expect(
      mergeTimeline(loaded, {
        removals: [{ entryId: mine.id, by: me, ts: 7 }],
      }).state.entries.has(mine.id),
    ).toBe(false);
  });

  test("the unverified mark is carried between copies and is lost only to a revision recorded here", () => {
    const mine = rev(emptyTimeline, "a", "user", 5);
    const marked: RevisionEntry = {
      ...mine,
      unverified: true,
      intake: { at: 1, size: 1 },
    };
    // A tab that holds it relays it as it is: the mark arrives.
    const relayed = structuredClone(marked);
    const there = mergeTimeline(emptyTimeline, { entries: [relayed] }).state;
    expect(there.entries.get(mine.id)).toEqual(marked);
    // Entries that are not revisions are never replaced, mark or not.
    const entry = {
      kind: "run",
      id: "r",
      runId: "r",
      ts: 1,
      author: me,
    } as const;
    const markedRun = { ...entry, unverified: true as const };
    const held = mergeTimeline(emptyTimeline, { entries: [markedRun] }).state;
    expect(
      mergeTimeline(held, { entries: [entry] }).state.entries.get("r"),
    ).toEqual(markedRun);
    // Run records of the two kinds never replace each other.
    const record = { ...run("r", 5), unverified: true as const };
    const runs = mergeTimeline(emptyTimeline, { runs: [record] }).state;
    expect(
      mergeTimeline(runs, {
        runs: [{ ...run("r", 5), updatedAt: 999 }],
      }).state.runs.get("r"),
    ).toEqual(record);
  });

  test("forgetting drops unverified records with no removal, and nothing recorded here", () => {
    const mine = rev(emptyTimeline, "a", "user", 5);
    const theirs: RevisionEntry = {
      ...rev(emptyTimeline, "b", "user", 5),
      unverified: true,
    };
    const record = { ...run("r", 5), unverified: true as const };
    const local = run("l", 5);
    let s = mergeTimeline(emptyTimeline, {
      entries: [
        mine,
        theirs,
        {
          kind: "run",
          id: "r",
          runId: "r",
          ts: 1,
          author: me,
          unverified: true,
        },
      ],
      runs: [record, local],
    }).state;
    const out = mergeTimeline(s, {
      forget: [mine.id, theirs.id, "r", "l", "nope"],
    });
    s = out.state;
    expect(out.changed.forget.sort()).toEqual([theirs.id, "r"].sort());
    expect(s.entries.has(mine.id)).toBe(true);
    expect(s.entries.has(theirs.id)).toBe(false);
    expect(s.entries.has("r")).toBe(false);
    expect(s.runs.has("r")).toBe(false);
    expect(s.runs.has("l")).toBe(true);
    expect(s.removals.size).toBe(0);
    // It can be taken in again.
    expect(
      mergeTimeline(s, { entries: [theirs] }).state.entries.has(theirs.id),
    ).toBe(true);
  });
});
