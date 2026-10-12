import { describe, expect, test } from "bun:test";
import { applyText, head, revisionId } from "@evmcrispr/space";
import { stopLookingAtRemoved } from "../../src/app/removed";
import { setUi, uiStore } from "../../src/app/ui-store";
import {
  type CleaningAction,
  clearTimeline,
  leftBehind,
  type Place,
  REACH,
  removeEntry,
  removeImported,
} from "../../src/space/cleaning";
import { readExport, restoreSpace } from "../../src/space/export";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";
import { settle } from "../helpers/tabs";

// The table in `space/cleaning.ts` says what each action that removes
// something reaches, place by place. This walks it: one space set up the
// same way for every action, the action, and for every place whether what
// the action names is gone from it. A cell that says `kept` must find it
// still there; any other must find it gone.

const me = { kind: "user" } as const;
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RUN = uuid(1);
const THEIR_RUN = uuid(2);
const run = (id: string, revision: string) => ({
  id,
  revisionId: revision,
  mode: "real" as const,
  status: "success" as const,
  startedAt: 5,
  by: me,
  console: { slots: [{ kind: "line", text: "printed" }], boxes: {}, live: 0 },
  errors: [],
  output: "",
  executedCount: 0,
  updatedAt: 5,
});

/** A space open in two tabs, holding something of every kind: a shared
 *  first revision, one the assistant made (with its chat mark and a
 *  finished run), a revision and a run an export brought, typing in both
 *  tabs' undo histories, and a chat of the browser. */
async function world() {
  const browser = testBrowser();
  const deleted: string[] = [];
  const deleteDoc = browser.storage.deleteDoc;
  browser.storage.deleteDoc = async (id) => {
    deleted.push(id);
    return deleteDoc(id);
  };
  const app = browser.tab();
  const other = browser.tab();
  const id = await app.spaces.create({ text: "exec 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  const first = head(space.timeline.getState())!;
  space.commit({
    entries: [
      {
        kind: "share",
        id: uuid(9),
        ts: 2,
        author: me,
        revisionId: first.id,
        cid: "QmCid",
        key: "A".repeat(43),
      },
    ],
  });
  space.editAsTurn("t", { kind: "write", text: "exec 2" });
  const theirs = space.endTurn("t")!;
  space.approve("exec 2");
  space.commit({
    entries: [{ kind: "run", id: RUN, runId: RUN, ts: 5, author: me }],
    runs: [run(RUN, theirs.id)],
  });
  const imported = revisionId("imported", undefined);
  await restoreSpace(
    app.spaces,
    readExport(
      {
        kind: "space",
        id,
        title: "",
        script: "exec 2",
        timeline: {
          entries: [
            {
              kind: "revision",
              id: imported,
              ts: 1,
              author: me,
              text: "imported",
              source: "user",
            },
            { kind: "run", id: THEIR_RUN, runId: THEIR_RUN, ts: 1, author: me },
          ],
          runs: [run(THEIR_RUN, imported)],
        },
      },
      "QmX",
    ),
    "merge",
  );
  await space.setMarkers({
    revisionChats: { [first.id]: "c0", [theirs.id]: "c1", [imported]: "c2" },
  });
  await app.storage.records.putChat({
    id: "c1",
    meta: { id: "c1" } as never,
    chat: { messages: ["read the script"] } as never,
  });
  const space2 = (await other.spaces.acquire(id))!;
  await settle();
  // Each tab has typing of its own to undo, and an editor to tell.
  applyText(space.text, "exec 2 a", ORIGIN.user);
  await settle();
  applyText(space2.text, "exec 2 a b", ORIGIN.user);
  await settle();
  const editors = [0, 0];
  space.onHistoryCleared(() => editors[0]++);
  space2.onHistoryCleared(() => editors[1]++);
  const stop = stopLookingAtRemoved(space2);
  return {
    app,
    other,
    id,
    space,
    space2,
    first,
    theirs,
    imported,
    deleted,
    editors,
    stop,
  };
}
type World = Awaited<ReturnType<typeof world>>;

/** What each action names, in this world, and how it is done. */
const ACTIONS: Record<
  CleaningAction,
  {
    names(w: World): { revision: string; run: string };
    act(w: World): Promise<void> | void;
  }
> = {
  remove: {
    names: (w) => ({ revision: w.theirs.id, run: RUN }),
    act(w) {
      removeEntry(w.space, w.theirs.id, me, 9_000);
      removeEntry(w.space, RUN, me, 9_000);
    },
  },
  removeImported: {
    names: (w) => ({ revision: w.imported, run: THEIR_RUN }),
    act: (w) => removeImported(w.space),
  },
  clearTimeline: {
    names: (w) => ({ revision: w.theirs.id, run: RUN }),
    act: (w) => clearTimeline(w.space, me, 9_000),
  },
  removeSpace: {
    names: (w) => ({ revision: w.theirs.id, run: RUN }),
    act: (w) => w.app.spaces.remove(w.id),
  },
};

/** Whether a place no longer holds what the action named. */
const GONE: Record<
  Place,
  (w: World, named: { revision: string; run: string }) => Promise<boolean>
> = {
  entries: async (w, { revision }) =>
    !(await w.app.storage.records.loadTimeline(w.id)).entries.some(
      (entry) => entry.id === revision,
    ),
  runs: async (w, { run }) =>
    !(await w.app.storage.records.loadTimeline(w.id)).runs.some(
      (record) => record.id === run,
    ),
  // A space that was removed is closed in every tab: nothing of it can be
  // read from a tab any more.
  memory: async (w, { revision, run }) =>
    (
      await Promise.all([w.app, w.other].map((tab) => tab.spaces.acquire(w.id)))
    ).every(
      (space) =>
        space === null ||
        (!space.timeline.getState().entries.has(revision) &&
          !space.timeline.getState().runs.has(run)),
    ),
  views: async (w) =>
    uiStore.getState().previewRevisionId === null ||
    (await w.other.spaces.acquire(w.id)) === null,
  // Asked last: an undo that works changes the script.
  undo: async (w) =>
    (await w.app.spaces.acquire(w.id)) === null ||
    (!w.space.undo.undo() && !w.space2.undo.undo()),
  editorUndo: async (w) =>
    (await w.app.spaces.acquire(w.id)) === null ||
    w.editors.every((told) => told > 0),
  documentLog: async (w) => w.deleted.includes(w.id),
  chatMarks: async (w, { revision }) =>
    !(
      revision in
      ((await w.app.storage.records.getMarkers(w.id)).revisionChats ?? {})
    ),
  index: async (w) => !(await w.app.storage.records.getSpace(w.id)),
  chats: async (w) => !(await w.app.storage.records.getChat("c1")),
};
const PLACES = Object.keys(GONE) as Place[];

describe("what each cleaning action reaches", () => {
  test("every action has a decision for every place", () => {
    for (const action of Object.keys(ACTIONS) as CleaningAction[])
      expect(Object.keys(REACH[action]).sort()).toEqual([...PLACES].sort());
    expect(Object.keys(REACH).sort()).toEqual(Object.keys(ACTIONS).sort());
  });

  for (const action of Object.keys(ACTIONS) as CleaningAction[])
    test(`${action}: each place holds, or no longer holds, what the table says`, async () => {
      const w = await world();
      const named = ACTIONS[action].names(w);
      setUi({ previewRevisionId: named.revision });
      // Everything named is there to begin with, in every place.
      for (const place of PLACES.filter((p) => p !== "undo"))
        expect({ place, before: await GONE[place](w, named) }).toEqual({
          place,
          before: false,
        });
      await ACTIONS[action].act(w);
      await settle();
      await settle();
      for (const place of PLACES)
        expect({ place, gone: await GONE[place](w, named) }).toEqual({
          place,
          gone: REACH[action][place] !== "kept",
        });
      // Chats are never a space's to remove, and every dialog says so.
      expect(leftBehind(action).join(" ")).toContain("Chats");
      expect(leftBehind(action).join(" ")).toContain("cannot be recalled");
      w.stop();
      setUi({ previewRevisionId: null });
    });

  test("an action that names some of a place leaves the rest of it", async () => {
    for (const action of [
      "remove",
      "removeImported",
      "clearTimeline",
    ] as const) {
      const w = await world();
      await ACTIONS[action].act(w);
      await settle();
      const stored = await w.app.storage.records.loadTimeline(w.id);
      // The shared first revision is nobody's to take: not a single
      // removal, not the imported records, not a clearing.
      expect(stored.entries.some((entry) => entry.id === w.first.id)).toBe(
        true,
      );
      expect(
        (await w.app.storage.records.getMarkers(w.id)).revisionChats,
      ).toMatchObject({ [w.first.id]: "c0" });
      // The script and its approval are never the timeline's to touch.
      expect(w.space.getText()).toBe("exec 2 a b");
      expect(w.space.markers.getState().approvedText).toBe("exec 2 a b");
      w.stop();
    }
  });

  test("removing a space leaves nothing of it in storage: no entry, run, removal or mark, and its document is deleted", async () => {
    const w = await world();
    removeEntry(w.space, w.theirs.id, me, 9_000);
    await settle();
    await w.app.spaces.remove(w.id);
    await settle();
    expect(await w.app.storage.records.loadTimeline(w.id)).toEqual({
      entries: [],
      runs: [],
      removals: [],
    });
    expect(await w.app.storage.records.getMarkers(w.id)).toEqual({});
    expect(w.deleted).toEqual([w.id]);
    expect(w.other.spaces.index.getState()).toEqual([]);
    // A writer that still holds the object writes nothing back.
    w.space2.commit({ entries: [w.theirs] });
    await settle();
    expect((await w.app.storage.records.loadTimeline(w.id)).entries).toEqual(
      [],
    );
    w.stop();
  });
});
