import { expect, test } from "bun:test";
import { emptyTimeline, type RevisionEntry } from "@evmcrispr/space";
import { foldUnchanged } from "../../src/review/ChangesDiff";
import { changesOf } from "../../src/review/changes";
import { revisionLabel } from "../../src/space/revision-label";
import { add, rev } from "../helpers/timeline";

function history() {
  let state = emptyTimeline;
  const push = (text: string, source: RevisionEntry["source"], ts: number) => {
    const entry = rev(state, text, source, ts);
    state = add(state, entry);
    return entry;
  };
  return { push, state: () => state };
}

test("a reviewed script has nothing to show", () => {
  const h = history();
  h.push("a", "user", 1);
  expect(changesOf("a", "a", h.state())).toEqual({
    text: "a",
    unreviewed: false,
    nothingApproved: false,
    diff: [{ kind: "same", text: "a" }],
    revisions: [],
  });
});

test("the diff is against the approved text; the revisions since it are listed with their stats", () => {
  const h = history();
  h.push("a\nb", "user", 1);
  const turn = h.push("a\nB", "assistant", 2);
  const typed = h.push("a\nB\nc", "user", 3);
  const changes = changesOf("a\nB\nc", "a\nb", h.state());
  expect(changes.unreviewed).toBe(true);
  expect(changes.diff).toEqual([
    { kind: "same", text: "a" },
    { kind: "removed", text: "b" },
    { kind: "added", text: "B" },
    { kind: "added", text: "c" },
  ]);
  expect(
    changes.revisions.map((r) => [r.entry.id, r.added, r.removed]),
  ).toEqual([
    [turn.id, 1, 1],
    [typed.id, 1, 0],
  ]);
  expect(changes.revisions[0].parent?.text).toBe("a\nb");
});

test("nothing approved: the whole script is new, empty lines included", () => {
  const h = history();
  h.push("a\n\nb", "import", 1);
  const changes = changesOf("a\n\nb", undefined, h.state());
  expect(changes).toMatchObject({ unreviewed: true, nothingApproved: true });
  expect(changes.diff).toEqual([
    { kind: "added", text: "a" },
    { kind: "added", text: "" },
    { kind: "added", text: "b" },
  ]);
  expect(changes.revisions).toHaveLength(1);
});

test("an approved text no revision holds any more lists every revision, and the diff is still against it", () => {
  const h = history();
  h.push("x", "assistant", 1);
  const changes = changesOf("x", "gone", h.state());
  expect(changes.unreviewed).toBe(true);
  expect(changes.diff).toEqual([
    { kind: "removed", text: "gone" },
    { kind: "added", text: "x" },
  ]);
  expect(changes.revisions).toHaveLength(1);
});

test("long runs of unchanged lines are folded, three kept on each side of a change", () => {
  const same = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      kind: "same" as const,
      text: `l${i}`,
    }));
  const parts = foldUnchanged([
    ...same(10),
    { kind: "added", text: "new" },
    ...same(5),
    { kind: "removed", text: "old" },
    ...same(10),
  ]);
  expect(parts.map((part) => [part.kind, part.lines.length])).toEqual([
    ["fold", 7],
    // 3 before, the change, 5 between (too few to fold), the change, 3 after.
    ["lines", 3 + 1 + 5 + 1 + 3],
    ["fold", 7],
  ]);
});

test("a revision reads as what happened", () => {
  const h = history();
  const first = h.push("a", "user", 1);
  const typed = h.push("b", "user", 2);
  const turn = h.push("c", "assistant", 3);
  const entries = () => h.state().entries;
  const say = (entry: RevisionEntry) => {
    const { who, what } = revisionLabel(entry, entries());
    return `${who} ${what}`;
  };
  expect(say(first)).toBe("You created the script");
  expect(say(typed)).toBe("You edited the script");
  expect(say(turn)).toBe("Assistant edited the script");
  expect(say({ ...turn, summary: "Pays the grant" })).toBe(
    "Assistant Pays the grant",
  );
  const loaded = { ...h.push("b", "load", 4), from: typed.id };
  expect(say(loaded)).toBe("You loaded a revision");
  const restored = { ...h.push("b2", "load", 5), from: turn.id };
  expect(say(restored)).toBe("You restored the script to before a change");
  expect(say(h.push("d", "revert", 6))).toBe("You reverted a change");
  const other = history();
  expect(say(other.push("z", "import", 1))).toBe("You imported the script");
  expect(say({ ...other.push("y", "import", 2), origin: { cid: "Qm" } })).toBe(
    "You imported the script from a link",
  );
});
