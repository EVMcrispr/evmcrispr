import { describe, expect, test } from "bun:test";
import {
  applyText,
  head,
  isReviewed,
  orderedEntries,
  revisions,
  shareOf,
} from "@evmcrispr/space";
import { stopLookingAtRemoved } from "../../src/app/removed";
import { setUi, uiStore } from "../../src/app/ui-store";
import { timelineRows } from "../../src/panel/space/rows";
import { askForReview, surfaceNow } from "../../src/review/surface";
import {
  clearForMe,
  clearTimeline,
  removeEntry,
  removeImported,
  showEarlier,
} from "../../src/space/cleaning";
import {
  readExport,
  restoreSpace,
  snapshotSpace,
} from "../../src/space/export";
import type { LiveSpace } from "../../src/space/live-space";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";
import { settle } from "../helpers/tabs";

const me = { kind: "user" } as const;
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const type = (space: LiveSpace, text: string) =>
  applyText(space.text, text, ORIGIN.user);
const reviewed = (space: LiveSpace) =>
  isReviewed(space.getText(), space.markers.getState().approvedText);
const run = (id: string, revisionId: string, status: string) => ({
  id,
  revisionId,
  mode: "real" as const,
  status: status as "success",
  startedAt: 5,
  by: me,
  console: { slots: [], boxes: {}, live: 0 },
  errors: [],
  output: "",
  executedCount: 0,
  updatedAt: 5,
});
const rows = (space: LiveSpace) =>
  timelineRows(space.timeline.getState(), space.markers.getState(), {
    filter: "all",
    shown: 200,
    reviewed: reviewed(space),
  });

/** Three revisions (the first shared), a finished run and one going on. */
async function written() {
  const app = testBrowser().tab();
  const id = await app.spaces.create({ text: "exec 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  const r1 = head(space.timeline.getState())!;
  space.commit({
    entries: [
      {
        kind: "share",
        id: uuid(1),
        ts: 2,
        author: me,
        revisionId: r1.id,
        cid: "QmCid",
        key: "A".repeat(43),
      },
    ],
  });
  type(space, "exec 2");
  const r2 = space.record("user")!;
  type(space, "exec 3");
  const r3 = space.record("user")!;
  space.commit({
    entries: [
      { kind: "run", id: uuid(2), runId: uuid(2), ts: 5, author: me },
      { kind: "run", id: uuid(3), runId: uuid(3), ts: 6, author: me },
    ],
    runs: [run(uuid(2), r2.id, "success"), run(uuid(3), r3.id, "running")],
  });
  return { app, id, space, r1, r2, r3 };
}

describe("Clear for me", () => {
  test("hides what is there and Show earlier brings it back; nothing is removed", async () => {
    const { space } = await written();
    const before = rows(space);
    expect(before.rows.length).toBeGreaterThan(0);
    const entries = space.timeline.getState().entries;
    await clearForMe(space, 1_000_000);
    expect(rows(space).rows).toEqual([]);
    expect(rows(space).hidden).toBe(5);
    expect(space.timeline.getState().entries).toBe(entries);
    await showEarlier(space);
    expect(rows(space)).toEqual(before);
  });
});

describe("Clear timeline", () => {
  test("keeps the script as one fresh revision, unfinished runs and shared revisions, and says who cleared", async () => {
    const { app, id, space, r1, r2, r3 } = await written();
    const text = space.getText();
    const approved = space.markers.getState().approvedText;
    clearTimeline(space, me, 10_000);
    const state = space.timeline.getState();
    const kinds = orderedEntries(state).map((e) => e.kind);
    expect(kinds.filter((k) => k === "cleared")).toHaveLength(1);
    expect(state.entries.has(r1.id)).toBe(true);
    expect(shareOf(state, r1.id)).toBeDefined();
    expect(state.entries.has(r2.id)).toBe(false);
    expect(state.entries.has(r3.id)).toBe(false);
    expect(state.runs.has(uuid(2))).toBe(false);
    expect(state.runs.has(uuid(3))).toBe(true);
    expect(state.entries.has(uuid(3))).toBe(true);
    const fresh = head(state)!;
    expect(fresh.text).toBe(text);
    expect(fresh.ts).toBe(10_000);
    expect(revisions(state)).toHaveLength(2);
    // The script and its approval are not the timeline's to touch.
    expect(space.getText()).toBe(text);
    expect(space.markers.getState().approvedText).toBe(approved);
    expect(reviewed(space)).toBe(true);
    // Stored: the removed texts are gone from storage.
    await settle();
    const stored = await app.storage.records.loadTimeline(id);
    expect(JSON.stringify(stored.entries)).not.toContain("exec 2");
    // Recording goes on from the fresh revision.
    type(space, "exec 4");
    expect(space.record("user")?.parent).toBe(fresh.id);
  });

  test("an unreviewed script stays unreviewed, and a second clear works like the first", async () => {
    const { space } = await written();
    space.editAsTurn("t", { kind: "write", text: "exec 666" });
    space.endTurn("t");
    expect(reviewed(space)).toBe(false);
    clearTimeline(space, me, 10_000);
    expect(reviewed(space)).toBe(false);
    expect(head(space.timeline.getState())?.text).toBe("exec 666");
    clearTimeline(space, me, 20_000);
    const state = space.timeline.getState();
    expect(head(state)).toMatchObject({ text: "exec 666", ts: 20_000 });
    expect(
      orderedEntries(state).filter((e) => e.kind === "cleared"),
    ).toHaveLength(1);
  });

  test("what an export brought is not what a clear keeps: not as shared, not as unfinished", async () => {
    const { app, id, space } = await written();
    const payload = JSON.parse(JSON.stringify(snapshotSpace(space)));
    const b = testBrowser().tab();
    await restoreSpace(b.spaces, readExport(payload, "QmX"), "restore");
    const there = (await b.spaces.acquire(id))!;
    expect(
      [...there.timeline.getState().entries.values()].some((e) => e.unverified),
    ).toBe(true);
    clearTimeline(there, me, Date.now());
    const kept = orderedEntries(there.timeline.getState());
    expect(kept.map((e) => e.kind).sort()).toEqual(["cleared", "revision"]);
    expect(kept.some((e) => e.unverified)).toBe(false);
    expect(there.timeline.getState().runs.size).toBe(0);
    void app;
  });
});

describe("Remove", () => {
  test("a removed entry is gone from storage and does not return with an older copy or export", async () => {
    const { app, id, space, r2 } = await written();
    const older = structuredClone(snapshotSpace(space));
    removeEntry(space, r2.id, me, 50);
    removeEntry(space, uuid(2), me, 50);
    expect(space.timeline.getState().entries.has(r2.id)).toBe(false);
    expect(space.timeline.getState().runs.has(uuid(2))).toBe(false);
    await settle();
    expect(
      JSON.stringify((await app.storage.records.loadTimeline(id)).entries),
    ).not.toContain("exec 2");
    await restoreSpace(
      app.spaces,
      readExport(JSON.parse(JSON.stringify(older)), "QmX"),
      "merge",
    );
    expect(space.timeline.getState().entries.has(r2.id)).toBe(false);
    expect(space.timeline.getState().runs.has(uuid(2))).toBe(false);
  });

  test("it touches nothing else: not the script, not its approval, not a run going on", async () => {
    const { space, r3 } = await written();
    removeEntry(space, r3.id, me, 50);
    expect(space.getText()).toBe("exec 3");
    expect(reviewed(space)).toBe(true);
    expect(space.timeline.getState().runs.get(uuid(3))?.status).toBe("running");
    // A run going on is not removed from under whoever runs it.
    removeEntry(space, uuid(3), me, 50);
    expect(space.timeline.getState().runs.has(uuid(3))).toBe(true);
  });

  test("removing what an export brought leaves the user's own revision of that state recordable", async () => {
    const { app, id, space } = await written();
    const squat = "exec 4";
    const b = testBrowser().tab();
    const bid = await b.spaces.create({ text: "exec 3", source: "user" });
    void bid;
    const payload = JSON.parse(JSON.stringify(snapshotSpace(space)));
    const local = head(space.timeline.getState())!;
    const { revisionId } = await import("@evmcrispr/space");
    payload.timeline.entries.push({
      kind: "revision",
      id: revisionId(squat, local.id),
      parent: local.id,
      text: squat,
      source: "user",
      author: me,
      ts: 1,
    });
    await restoreSpace(app.spaces, readExport(payload, "QmX"), "merge");
    const theirs = revisionId(squat, local.id);
    expect(space.timeline.getState().entries.get(theirs)?.unverified).toBe(
      true,
    );
    removeEntry(space, theirs, me, 60);
    expect(space.timeline.getState().entries.has(theirs)).toBe(false);
    type(space, squat);
    const mine = space.record("user");
    expect(mine?.id).toBe(theirs);
    expect(space.timeline.getState().entries.get(theirs)).toEqual(mine!);
    await settle();
    const stored = await app.storage.records.loadTimeline(id);
    expect(stored.entries.find((e) => e.id === theirs)).toEqual(mine!);
  });

  test("Remove imported records drops all an export brought and nothing else, leaves no removal, and is stored", async () => {
    const { app, id, space } = await written();
    const payload = JSON.parse(JSON.stringify(snapshotSpace(space)));
    const b = testBrowser().tab();
    await restoreSpace(b.spaces, readExport(payload, "QmX"), "restore");
    const there = (await b.spaces.acquire(id))!;
    type(there, "exec 9");
    const mine = there.record("user")!;
    const text = there.getText();
    removeImported(there);
    const state = there.timeline.getState();
    expect([...state.entries.values()].some((e) => e.unverified)).toBe(false);
    expect(state.runs.size).toBe(0);
    expect(state.removals.size).toBe(0);
    expect(state.entries.get(mine.id)).toEqual(mine);
    expect(there.getText()).toBe(text);
    expect(reviewed(there)).toBe(true);
    await settle();
    const stored = await b.storage.records.loadTimeline(id);
    expect(stored.entries.some((e) => e.unverified)).toBe(false);
    expect(stored.runs).toEqual([]);
    // The link can be opened again.
    await restoreSpace(b.spaces, readExport(payload, "QmX"), "merge");
    expect(
      [...there.timeline.getState().entries.values()].some((e) => e.unverified),
    ).toBe(true);
    void app;
  });

  test("the removed text is in no record of storage and in no tab's timeline; a view or a review of it closes", async () => {
    const browser = testBrowser();
    const app = browser.tab();
    const id = await app.spaces.create({ text: "exec 1", source: "user" });
    const space = (await app.spaces.acquire(id))!;
    space.editAsTurn("t", { kind: "write", text: "exec SECRET" });
    const secret = space.endTurn("t")!;
    const other = (await browser.tab().spaces.acquire(id))!;
    await settle();
    expect(other.timeline.getState().entries.has(secret.id)).toBe(true);

    const stop = stopLookingAtRemoved(other);
    setUi({ previewRevisionId: secret.id });
    askForReview(other);
    expect(JSON.stringify(surfaceNow().shown)).toContain("SECRET");

    removeEntry(space, secret.id, me, 50);
    await settle();
    for (const tab of [space, other])
      expect(
        JSON.stringify(orderedEntries(tab.timeline.getState())),
      ).not.toContain("SECRET");
    const stored = await app.storage.records.loadTimeline(id);
    expect(JSON.stringify(stored.entries)).not.toContain("SECRET");
    expect(stored.removals.map((r) => r.entryId)).toEqual([secret.id]);
    expect(uiStore.getState().previewRevisionId).toBeNull();
    expect(surfaceNow().open).toBe(false);
    stop();
    // The script is the user's to edit: removing a revision left it.
    expect(space.getText()).toBe("exec SECRET");
  });

  test("Clear timeline leaves in storage only what it keeps, and empties undo", async () => {
    const { app, id, space, r1 } = await written();
    clearTimeline(space, me, 10_000);
    await settle();
    const stored = await app.storage.records.loadTimeline(id);
    expect(stored.runs.map((r) => r.id)).toEqual([uuid(3)]);
    expect(
      stored.entries
        .map((e) => (e.kind === "revision" ? e.text : e.kind))
        .sort(),
    ).toEqual(["cleared", "exec 1", "exec 3", "run", "share"]);
    expect(stored.entries.some((e) => e.id === r1.id)).toBe(true);
    // Ctrl+Z cannot bring an earlier version back.
    expect(space.undo.undo()).toBe(false);
    expect(space.getText()).toBe("exec 3");
  });
});
