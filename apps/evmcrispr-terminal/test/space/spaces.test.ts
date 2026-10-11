import { describe, expect, test } from "bun:test";
import {
  applyText,
  head,
  isReviewed,
  revisionId,
  revisions,
} from "@evmcrispr/space";
import type { LiveSpace } from "../../src/space/live-space";
import { createSpaces } from "../../src/space/spaces";
import { tabTransport } from "../../src/space/tab-transport";
import { ORIGIN } from "../../src/space/undo";
import { createChanges } from "../../src/storage/changes";
import { memoryStorage } from "../../src/storage/index";
import { LockTable, localLocks } from "../../src/storage/locks";
import { channelHub, settle } from "../helpers/tabs";

/** One fake browser; `tab()` opens a tab on its storage. */
function browser() {
  const storage = memoryStorage();
  const hub = channelHub();
  const table = new LockTable();
  let clock = 1000;
  return {
    storage,
    tab: () =>
      createSpaces({
        storage,
        transport: tabTransport(hub),
        changes: createChanges(hub),
        locks: localLocks(table),
        now: () => clock++,
        me: () => ({ kind: "user" }),
      }),
  };
}

const sources = (space: LiveSpace) =>
  revisions(space.timeline.getState()).map((r) => r.source);
const reviewed = (space: LiveSpace) =>
  isReviewed(space.getText(), space.markers.getState().approvedText);

describe("spaces", () => {
  test("create records the first revision and approves it", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "# Pay\nexec 1", source: "user" });
    const space = (await tab.acquire(id))!;
    const first = head(space.timeline.getState())!;
    expect(first.text).toBe("# Pay\nexec 1");
    expect(space.markers.getState().approvedText).toBe("# Pay\nexec 1");
    expect(tab.index.getState()[0].title).toBe("Pay");
    expect(await tab.acquire("missing")).toBeNull();
  });

  test("a space from a share link starts approved too", async () => {
    const tab = browser().tab();
    const id = await tab.create({
      text: "exec 1",
      source: "import",
      origin: { cid: "Qm" },
    });
    const space = (await tab.acquire(id))!;
    const first = head(space.timeline.getState())!;
    expect(first.origin).toEqual({ cid: "Qm" });
    expect(reviewed(space)).toBe(true);
    expect(tab.index.getState()[0].unreviewed).toBe(false);
  });

  test("two tabs converge on text and records", async () => {
    const b = browser();
    const [one, two] = [b.tab(), b.tab()];
    const id = await one.create({ text: "a", source: "user" });
    const [s1, s2] = [(await one.acquire(id))!, (await two.acquire(id))!];
    applyText(s1.text, "a\nb", ORIGIN.user);
    applyText(s2.text, "z\na", ORIGIN.user);
    await settle();
    expect(s1.getText()).toBe("z\na\nb");
    expect(s2.getText()).toBe("z\na\nb");
    s1.record("user");
    await settle();
    expect(head(s2.timeline.getState())!.text).toBe("z\na\nb");
    // each tab undoes only what was typed in it
    s2.undo.undo();
    await settle();
    expect(s1.getText()).toBe("a\nb");
  });

  test("an assistant turn is one revision and one undo step", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "exec 1", source: "user" });
    const space = (await tab.acquire(id))!;
    applyText(space.text, "exec 1\nexec 2", ORIGIN.user);
    expect(
      space.editAsTurn("t1", {
        kind: "replace",
        oldString: "exec 2",
        newString: "exec 3",
      }),
    ).toEqual({ ok: true });
    space.editAsTurn("t1", {
      kind: "replace",
      oldString: "exec 1",
      newString: "exec 0",
    });
    const turn = space.endTurn("t1", "Renumbered the calls.")!;
    expect(sources(space)).toEqual(["user", "user", "assistant"]);
    expect(turn.summary).toBe("Renumbered the calls.");
    expect(turn.author).toEqual({ kind: "assistant" });
    space.undo.undo();
    expect(space.getText()).toBe("exec 1\nexec 2");
    expect(space.endTurn("t1")).toBeNull();
  });

  test("the approved text follows the user and stops at the assistant", async () => {
    const b = browser();
    const tab = b.tab();
    const id = await tab.create({ text: "exec 1", source: "user" });
    const space = (await tab.acquire(id))!;
    applyText(space.text, "exec 1\nexec 2", ORIGIN.user);
    expect(reviewed(space)).toBe(true);
    space.editAsTurn("t1", {
      kind: "replace",
      oldString: "exec 2",
      newString: "exec 3",
    });
    space.endTurn("t1");
    expect(reviewed(space)).toBe(false);
    expect(space.markers.getState().approvedText).toBe("exec 1\nexec 2");
    // The user's typing on top of a change nobody reviewed stays unreviewed.
    applyText(space.text, "exec 1\nexec 3\nexec 9", ORIGIN.user);
    space.record("user");
    expect(reviewed(space)).toBe(false);
    // Typing back to exactly the approved text is reviewed again.
    applyText(space.text, "exec 1\nexec 2", ORIGIN.user);
    expect(reviewed(space)).toBe(true);
    applyText(space.text, "exec 1\nexec 2\nexec 4", ORIGIN.user);
    expect(reviewed(space)).toBe(true);
    await settle();
    expect((await b.storage.records.getMarkers(id)).approvedText).toBe(
      "exec 1\nexec 2\nexec 4",
    );
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(tab.index.getState()[0].unreviewed).toBe(false);
  });

  test("undo and redo of the user's own typing on an approved text stay reviewed", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "a", source: "user" });
    const space = (await tab.acquire(id))!;
    applyText(space.text, "ab", ORIGIN.user);
    space.undo.undo();
    expect(space.getText()).toBe("a");
    expect(reviewed(space)).toBe(true);
    space.undo.redo();
    expect(space.getText()).toBe("ab");
    expect(reviewed(space)).toBe(true);
  });

  test("undoing an assistant turn back to the approved text is reviewed; redoing it is not", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "a", source: "user" });
    const space = (await tab.acquire(id))!;
    space.editAsTurn("t1", { kind: "replace", oldString: "a", newString: "A" });
    space.endTurn("t1");
    space.undo.undo();
    expect(reviewed(space)).toBe(true);
    space.undo.redo();
    expect(space.getText()).toBe("A");
    expect(reviewed(space)).toBe(false);
    expect(space.markers.getState().approvedText).toBe("a");
  });

  test("undoing the user's own deletion of what the assistant wrote does not approve it", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "a", source: "user" });
    const space = (await tab.acquire(id))!;
    space.editAsTurn("t1", {
      kind: "replace",
      oldString: "a",
      newString: "aX",
    });
    space.endTurn("t1");
    applyText(space.text, "a", ORIGIN.user);
    expect(reviewed(space)).toBe(true);
    space.undo.undo();
    expect(space.getText()).toBe("aX");
    expect(reviewed(space)).toBe(false);
    expect(space.markers.getState().approvedText).toBe("a");
  });

  test("an undo lands reviewed only on a text that was approved, whichever step it applied", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "a", source: "user" });
    const space = (await tab.acquire(id))!;
    space.editAsTurn("t1", {
      kind: "replace",
      oldString: "a",
      newString: "aX",
    });
    space.endTurn("t1");
    await space.setMarkers({ approvedText: "aX" });
    // Typed and deleted in one capture: a step that changes nothing, which
    // undo skips to apply the assistant's below it.
    applyText(space.text, "aXu", ORIGIN.user);
    applyText(space.text, "aX", ORIGIN.user);
    space.undo.undo();
    // "a" was approved, but before this load: nothing remembers it here.
    expect(space.getText()).toBe("a");
    expect(reviewed(space)).toBe(false);
    expect(space.markers.getState().approvedText).toBe("aX");
    space.undo.redo();
    expect(space.getText()).toBe("aX");
    expect(reviewed(space)).toBe(true);
  });

  test("an old approval is not reused to bless what another copy changed", async () => {
    const b = browser();
    const [one, two] = [b.tab(), b.tab()];
    const id = await one.create({ text: "A", source: "user" });
    const [s1, s2] = [(await one.acquire(id))!, (await two.acquire(id))!];
    applyText(s1.text, "A\nsafety", ORIGIN.user);
    await settle();
    // Another copy removes exactly that line; nobody here approved that.
    s2.editAsTurn("t", { kind: "write", text: "A" });
    s2.endTurn("t");
    await settle();
    expect(s1.getText()).toBe("A");
    expect(reviewed(s1)).toBe(false);
    applyText(s1.text, "Ac", ORIGIN.user);
    s1.undo.undo();
    expect(s1.getText()).toBe("A");
    expect(reviewed(s1)).toBe(false);
    expect(s1.markers.getState().approvedText).toBe("A\nsafety");
  });

  test("a long stretch of typing can still be undone into a reviewed script", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "", source: "user" });
    const space = (await tab.acquire(id))!;
    // More keystrokes than approved texts are remembered, in one undo step.
    for (let i = 0; i < 400; i++)
      applyText(space.text, `${space.getText()}x`, ORIGIN.user);
    expect(reviewed(space)).toBe(true);
    space.undo.undo();
    expect(space.getText()).toBe("");
    expect(reviewed(space)).toBe(true);
    space.undo.redo();
    expect(space.getText().length).toBe(400);
    expect(reviewed(space)).toBe(true);
    applyText(space.text, "typed after", ORIGIN.user);
    expect(reviewed(space)).toBe(true);
  });

  test("a space that could not be made leaves nothing behind and can be made again", async () => {
    const b = browser();
    const persistDoc = b.storage.persistDoc;
    let broken = true;
    b.storage.persistDoc = async (spaceId, doc) => {
      if (broken) throw new Error("quota");
      return persistDoc(spaceId, doc);
    };
    const tab = b.tab();
    await expect(
      tab.create({ text: "exec 1", source: "user" }, "s1"),
    ).rejects.toThrow("quota");
    expect(await b.storage.records.getSpace("s1")).toBeUndefined();
    expect(tab.index.getState()).toEqual([]);
    broken = false;
    await tab.create({ text: "exec 1", source: "user" }, "s1");
    expect((await tab.acquire("s1"))!.getText()).toBe("exec 1");
  });

  test("a fresh load of a space whose text is the approved text is reviewed", async () => {
    const b = browser();
    const one = b.tab();
    const id = await one.create({ text: "a", source: "user" });
    const s1 = (await one.acquire(id))!;
    applyText(s1.text, "ab", ORIGIN.user);
    one.release(id);
    await settle();
    const s2 = (await b.tab().acquire(id))!;
    expect(s2.getText()).toBe("ab");
    expect(reviewed(s2)).toBe(true);
  });

  test("no entry can talk the gate open: a claimed author, a backdated time", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "exec 1", source: "user" });
    const space = (await tab.acquire(id))!;
    space.editAsTurn("t1", {
      kind: "replace",
      oldString: "exec 1",
      newString: "exec 666",
    });
    const turn = space.endTurn("t1")!;
    const forged = "exec 666\n";
    space.commit({
      entries: [
        {
          kind: "revision",
          id: revisionId(forged, turn.id),
          parent: turn.id,
          text: forged,
          source: "user",
          author: { kind: "user" },
          ts: 0,
        },
      ],
      removals: [{ entryId: turn.id, by: { kind: "user" }, ts: 0 }],
    });
    expect(reviewed(space)).toBe(false);
    expect(space.markers.getState().approvedText).toBe("exec 1");
  });

  test("another tab re-reads the approved text; it does not work it out from the update", async () => {
    const b = browser();
    const [one, two] = [b.tab(), b.tab()];
    const id = await one.create({ text: "a", source: "user" });
    const [s1, s2] = [(await one.acquire(id))!, (await two.acquire(id))!];
    applyText(s1.text, "ab", ORIGIN.user);
    await settle();
    expect(s2.getText()).toBe("ab");
    expect(reviewed(s2)).toBe(true);
    s1.editAsTurn("t1", { kind: "replace", oldString: "ab", newString: "abc" });
    s1.endTurn("t1");
    await settle();
    expect(s2.getText()).toBe("abc");
    expect(reviewed(s2)).toBe(false);
    expect(s2.markers.getState().approvedText).toBe("ab");
  });

  test("a failed edit records nothing for the turn", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "exec 1", source: "user" });
    const space = (await tab.acquire(id))!;
    expect(
      space.editAsTurn("t1", {
        kind: "replace",
        oldString: "nope",
        newString: "x",
      }).ok,
    ).toBe(false);
    expect(space.endTurn("t1")).toBeNull();
    expect(sources(space)).toEqual(["user"]);
  });

  test("load records pending typing first, can be undone, and stays approved", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "v1", source: "user" });
    const space = (await tab.acquire(id))!;
    const v1 = head(space.timeline.getState())!;
    applyText(space.text, "v2 typed", ORIGIN.user);
    const loaded = space.load("v1", "load", v1.id)!;
    expect(sources(space)).toEqual(["user", "user", "load"]);
    expect(loaded.from).toBe(v1.id);
    expect(space.getText()).toBe("v1");
    expect(reviewed(space)).toBe(true);
    space.undo.undo();
    expect(space.getText()).toBe("v2 typed");
    expect(reviewed(space)).toBe(true);
  });

  test("restoring to before an assistant turn lands on the approved text and is reviewed", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "v1", source: "user" });
    const space = (await tab.acquire(id))!;
    space.editAsTurn("t", { kind: "write", text: "v1 + assistant" });
    space.endTurn("t");
    expect(reviewed(space)).toBe(false);
    space.load("v1", "load");
    expect(reviewed(space)).toBe(true);
  });

  test("loading the assistant's own revision does not approve it", async () => {
    const tab = browser().tab();
    const id = await tab.create({ text: "v1", source: "user" });
    const space = (await tab.acquire(id))!;
    space.editAsTurn("t", { kind: "write", text: "v1 + assistant" });
    const theirs = space.endTurn("t")!;
    space.load("v1", "load");
    expect(reviewed(space)).toBe(true);
    space.load(theirs.text, "load", theirs.id);
    expect(space.getText()).toBe("v1 + assistant");
    expect(reviewed(space)).toBe(false);
    expect(space.markers.getState().approvedText).toBe("v1");
  });

  test("after a reload, loading an older revision of the user's own needs a review", async () => {
    const b = browser();
    const one = b.tab();
    const id = await one.create({ text: "v1", source: "user" });
    const s1 = (await one.acquire(id))!;
    applyText(s1.text, "v2", ORIGIN.user);
    s1.record("user");
    one.release(id);
    await settle();
    const s2 = (await b.tab().acquire(id))!;
    expect(reviewed(s2)).toBe(true);
    s2.load("v1", "load");
    expect(reviewed(s2)).toBe(false);
    expect(s2.markers.getState().approvedText).toBe("v2");
  });

  test("typing from a previous visit is recorded on open, unless another tab has the space", async () => {
    const b = browser();
    const one = b.tab();
    const id = await one.create({ text: "a", source: "user" });
    const s1 = (await one.acquire(id))!;
    applyText(s1.text, "a typed", ORIGIN.user);
    const two = b.tab();
    const s2 = (await two.acquire(id))!;
    expect(sources(s2)).toEqual(["user"]);
    one.release(id);
    two.release(id);
    await settle();
    const three = b.tab();
    const s3 = (await three.acquire(id))!;
    expect(sources(s3)).toEqual(["user", "user"]);
    expect(head(s3.timeline.getState())!.text).toBe("a typed");
  });

  test("adding spaces from two tabs loses neither; removal reaches the other tab", async () => {
    const b = browser();
    const [one, two] = [b.tab(), b.tab()];
    const [x, y] = await Promise.all([
      one.create({ text: "x", source: "user" }),
      two.create({ text: "y", source: "user" }),
    ]);
    await settle();
    expect(
      one.index
        .getState()
        .map((s) => s.id)
        .sort(),
    ).toEqual([x, y].sort());
    expect(two.index.getState().length).toBe(2);
    await one.remove(x);
    await settle();
    expect(two.index.getState().map((s) => s.id)).toEqual([y]);
  });
});
