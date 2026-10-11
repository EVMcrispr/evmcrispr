import { expect, test } from "bun:test";
import { emptyTimeline, mergeTimeline } from "@evmcrispr/space";
import { type Row, timelineRows, WINDOW } from "../../src/panel/space/rows";
import { add, rev, run } from "../helpers/timeline";

const all = { filter: "all", shown: WINDOW } as const;
const kinds = (rows: Row[]) => rows.map((row) => row.kind);

/** v1 by the user, v2 by the assistant, a run, v3 and v4 by the user. */
function sample() {
  let s = emptyTimeline;
  s = add(s, rev(s, "a\n", "user", 1));
  s = add(s, rev(s, "a\nb\n", "assistant", 2));
  s = run(s, "r1", 3);
  s = add(s, rev(s, "a\nb\nc\n", "user", 4));
  s = add(s, rev(s, "a\nc\n", "user", 5));
  return s;
}

test("rows are the entries oldest first, with the lines each revision changed", () => {
  const { rows, earlier } = timelineRows(
    sample(),
    {},
    { ...all, reviewed: true },
  );
  expect(earlier).toBe(0);
  expect(kinds(rows)).toEqual(["revision", "revision", "run", "revisions"]);
  expect(rows[0]).toMatchObject({ added: 1, removed: 0, parent: undefined });
  expect(rows[1]).toMatchObject({
    added: 1,
    removed: 0,
    parent: { text: "a\n" },
  });
});

test("consecutive revisions of the user collapse; anything between them breaks the group", () => {
  const { rows } = timelineRows(sample(), {}, { ...all, reviewed: true });
  const group = rows[3];
  if (group.kind !== "revisions") throw new Error("expected a group");
  expect(group.rows.map((row) => row.entry.text)).toEqual([
    "a\nb\nc\n",
    "a\nc\n",
  ]);
  expect(group.rows[1]).toMatchObject({ added: 0, removed: 1 });
});

test("a load or an import is not folded into the user's typing", () => {
  let s = emptyTimeline;
  s = add(s, rev(s, "a", "import", 1));
  s = add(s, rev(s, "b", "user", 2));
  s = add(s, rev(s, "a", "load", 3));
  expect(kinds(timelineRows(s, {}, { ...all, reviewed: true }).rows)).toEqual([
    "revision",
    "revision",
    "revision",
  ]);
});

test("the filter keeps revisions, or runs", () => {
  let s = sample();
  s = add(s, { kind: "cleared", id: "c", ts: 6, author: { kind: "user" } });
  const of = (filter: "all" | "revisions" | "runs") =>
    kinds(timelineRows(s, {}, { filter, shown: WINDOW, reviewed: true }).rows);
  expect(of("all")).toEqual([
    "revision",
    "revision",
    "run",
    "revisions",
    "cleared",
  ]);
  expect(of("revisions")).toEqual(["revision", "revision", "revisions"]);
  expect(of("runs")).toEqual(["run"]);
});

test("the latest run is expanded, earlier ones are not", () => {
  let s = sample();
  s = run(s, "r2", 9);
  const runs = timelineRows(s, {}, { ...all, reviewed: true }).rows.filter(
    (row) => row.kind === "run",
  );
  expect(runs.map((row) => row.kind === "run" && row.expanded)).toEqual([
    false,
    true,
  ]);
});

test("revisions recorded since the approved text are marked, while the script is unreviewed", () => {
  const s = sample();
  const unreviewed = (text: string, approvedText: string) =>
    timelineRows(
      s,
      { approvedText },
      { ...all, reviewed: text === approvedText },
    )
      .rows.flatMap((row) => (row.kind === "revisions" ? row.rows : [row]))
      .filter((row) => row.kind === "revision" && row.unreviewed)
      .map((row) => row.kind === "revision" && row.entry.text);
  expect(unreviewed("a\nc\n", "a\n")).toEqual([
    "a\nb\n",
    "a\nb\nc\n",
    "a\nc\n",
  ]);
  // Reviewed: nothing is marked, also when no revision holds the text.
  expect(unreviewed("typed since", "typed since")).toEqual([]);
});

test("entries before the hidden mark are left out and counted", () => {
  const { rows, earlier } = timelineRows(
    sample(),
    { hiddenBefore: 3 },
    { ...all, reviewed: true },
  );
  expect(kinds(rows)).toEqual(["run", "revisions"]);
  expect(earlier).toBe(2);
});

test("a revision whose parent is gone has no parent to restore", () => {
  let s = sample();
  const [first] = [...s.entries.values()];
  s = mergeTimeline(s, {
    removals: [{ entryId: first.id, by: { kind: "user" }, ts: 9 }],
  }).state;
  const { rows } = timelineRows(s, {}, { ...all, reviewed: true });
  expect(rows[0]).toMatchObject({ parent: undefined, added: 2 });
});

test("renders the latest 200 and counts the rest", () => {
  let s = emptyTimeline;
  for (let i = 0; i < 250; i++)
    s = add(s, rev(s, `v${i}`, i % 2 ? "assistant" : "user", i));
  const { rows, earlier } = timelineRows(s, {}, { ...all, reviewed: true });
  expect(earlier).toBe(50);
  expect(rows.length).toBe(WINDOW);
  expect(
    timelineRows(s, {}, { filter: "all", shown: 2 * WINDOW, reviewed: true })
      .earlier,
  ).toBe(0);
});

test("an unreviewed change stays on the list however many entries an export dates after it", () => {
  let s = emptyTimeline;
  s = add(s, rev(s, "a\n", "user", 1));
  const change = rev(s, "a\nb\n", "assistant", 2);
  s = add(s, change);
  // What an export brought: more than the window, all dated later, one of
  // them claiming the approved text.
  const theirs = Array.from({ length: WINDOW + 50 }, (_, i) => ({
    ...rev(emptyTimeline, i === 7 ? "a\n" : `t${i}\n`, "user", 1_000 + i),
    unverified: true as const,
  }));
  s = mergeTimeline(s, { entries: theirs }).state;
  const { rows, earlier } = timelineRows(
    s,
    { approvedText: "a\n" },
    { ...all, reviewed: false },
  );
  const mine = rows.find(
    (row) => row.kind === "revision" && row.entry.id === change.id,
  );
  expect(mine).toMatchObject({ unreviewed: true });
  // Only what was recorded before the approved text is under "Show earlier".
  expect(earlier).toBe(1);
  // What an export brought is never grouped with, or shown as, the user's typing.
  expect(rows.some((row) => row.kind === "revisions")).toBe(false);
});
