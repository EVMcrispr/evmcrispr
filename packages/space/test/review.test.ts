import { describe, expect, test } from "bun:test";
import {
  approvedAfter,
  approvedTexts,
  type ChangeKind,
  isReviewed,
  revisionsSinceApproved,
} from "../src/review";
import { nextRevision } from "../src/revisions";
import {
  emptyTimeline,
  mergeTimeline,
  type TimelineState,
} from "../src/timeline";
import type { Author } from "../src/types";

describe("review", () => {
  test("reviewed means the text is the approved text, and nothing else", () => {
    expect(isReviewed("exec 1", "exec 1")).toBe(true);
    expect(isReviewed("exec 1 ", "exec 1")).toBe(false);
    expect(isReviewed("", undefined)).toBe(false);
  });

  /** A script and its marker, moved the way a host moves them. */
  function script(text: string) {
    const seen = approvedTexts();
    seen.add(text);
    const state = { text, approved: text as string | undefined };
    const change = (kind: ChangeKind) => (after: string) => {
      const next = approvedAfter(state.approved, seen, state.text, after, kind);
      if (next !== undefined && next !== state.approved) seen.add(next);
      state.approved = next;
      state.text = after;
      return isReviewed(state.text, state.approved);
    };
    return {
      state,
      own: change("own"),
      foreign: change("foreign"),
      neutral: change("neutral"),
    };
  }

  test("the user's own change to an approved text takes the marker along", () => {
    const s = script("A");
    expect(s.own("A2")).toBe(true);
    expect(s.state.approved).toBe("A2");
  });

  test("a foreign change does not, and the user's typing after it stays unreviewed", () => {
    const s = script("A");
    expect(s.foreign("AX")).toBe(false);
    expect(s.own("AXy")).toBe(false);
    expect(s.state.approved).toBe("A");
  });

  test("typing back to exactly the approved text is reviewed again, and follows from there", () => {
    const s = script("A");
    s.foreign("AX");
    expect(s.own("A")).toBe(true);
    expect(s.own("A3")).toBe(true);
  });

  test("own typing on an approved text, undo, redo: reviewed throughout", () => {
    const s = script("A");
    expect([s.own("A2"), s.neutral("A"), s.neutral("A2")]).toEqual([
      true,
      true,
      true,
    ]);
  });

  test("an assistant turn undone is reviewed; redone it is not", () => {
    const s = script("A");
    s.foreign("AX");
    expect(s.neutral("A")).toBe(true);
    expect(s.neutral("AX")).toBe(false);
    expect(s.state.approved).toBe("A");
  });

  test("deleting the assistant's line by hand and undoing that is unreviewed", () => {
    const s = script("A");
    s.foreign("AX");
    expect(s.own("A")).toBe(true);
    expect(s.neutral("AX")).toBe(false);
  });

  test("an old approval is not reused to bless a foreign change", () => {
    const s = script("A");
    s.own("A2"); // a safety line, approved
    expect(s.foreign("A")).toBe(false); // someone removes exactly that line
    expect(s.own("Ac")).toBe(false);
    expect(s.neutral("A")).toBe(false); // undo lands on a text approved once
    expect(s.state.approved).toBe("A2");
  });

  test("own typing, an assistant turn, undo twice: reviewed at each approved state", () => {
    const s = script("A");
    s.own("A2");
    s.foreign("Z");
    expect(s.neutral("A2")).toBe(true);
    expect(s.neutral("A")).toBe(true);
    expect(s.state.approved).toBe("A");
  });

  test("a foreign write is reviewed only when it lands exactly on the approved text", () => {
    const s = script("A");
    s.own("A2");
    s.foreign("Z");
    expect(s.foreign("A")).toBe(false); // an older member of the set
    expect(s.foreign("A2")).toBe(true);
  });

  test("a neutral change onto a text never approved is unreviewed", () => {
    const s = script("A");
    expect(s.neutral("flushed")).toBe(false);
    expect(s.state.approved).toBe("A");
  });

  test("nothing approved stays so until the user approves", () => {
    const seen = approvedTexts();
    for (const kind of ["own", "foreign", "neutral"] as const)
      expect(approvedAfter(undefined, seen, "a", "ab", kind)).toBeUndefined();
  });

  test("the revisions since the text last matched are for display only", () => {
    const me: Author = { kind: "user" };
    let s: TimelineState = emptyTimeline;
    const ids: string[] = [];
    for (const [ts, text] of ["a", "b", "a", "c", "d"].entries()) {
      const r = nextRevision(s, text, { source: "user", author: me, ts })!;
      ids.push(r.id);
      s = mergeTimeline(s, { entries: [r] }).state;
    }
    expect(revisionsSinceApproved(s, "a").map((r) => r.id)).toEqual(
      ids.slice(3),
    );
    expect(revisionsSinceApproved(s, "d")).toEqual([]);
    expect(revisionsSinceApproved(s, "never recorded").length).toBe(5);
    expect(revisionsSinceApproved(s, undefined).length).toBe(5);
  });

  test("the texts approved so far are remembered, up to a limit, oldest dropped", () => {
    const seen = approvedTexts(2);
    expect(seen.has("a")).toBe(false);
    seen.add("a");
    seen.add("b");
    seen.add("a");
    expect([seen.has("a"), seen.has("b")]).toEqual([true, true]);
    seen.add("c");
    expect([seen.has("a"), seen.has("b"), seen.has("c")]).toEqual([
      true,
      false,
      true,
    ]);
  });

  test("a revision an export brought does not move where the list starts", () => {
    const me: Author = { kind: "user" };
    let s = emptyTimeline;
    const add = (text: string, source: "user" | "assistant", ts: number) => {
      const entry = nextRevision(s, text, { source, author: me, ts });
      if (entry) s = mergeTimeline(s, { entries: [entry] }).state;
      return entry;
    };
    add("a", "user", 1);
    const change = add("b", "assistant", 2);
    if (!change) throw new Error("expected a revision");
    // Claims the approved text, later than everything.
    const child = nextRevision(s, "a", { source: "user", author: me, ts: 9 });
    if (!child) throw new Error("expected a revision");
    s = mergeTimeline(s, { entries: [{ ...child, unverified: true }] }).state;
    expect(revisionsSinceApproved(s, "a").map((r) => r.id)).toEqual([
      change.id,
      child.id,
    ]);
  });
});
