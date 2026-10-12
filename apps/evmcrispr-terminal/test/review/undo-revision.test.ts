import { expect, test } from "bun:test";
import { applyText, head, isReviewed, revisions } from "@evmcrispr/space";
import { restoreBefore, revertRevision } from "../../src/review/undo-revision";
import type { LiveSpace } from "../../src/space/live-space";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";

const reviewed = (space: LiveSpace) =>
  isReviewed(space.getText(), space.markers.getState().approvedText);
const turn = (space: LiveSpace, id: string, text: string) => {
  space.editAsTurn(id, { kind: "write", text });
  return space.endTurn(id)!;
};
async function make(text: string) {
  const app = testBrowser().tab();
  const id = await app.spaces.create({ text, source: "user" });
  return (await app.spaces.acquire(id))!;
}

test("a clean revert keeps later typing, records a revert revision, and Ctrl+Z brings the change back unreviewed", async () => {
  const space = await make("a\nb\nc");
  const change = turn(space, "t1", "a\nB\nc");
  applyText(space.text, "a\nB\nc\nd", ORIGIN.user);
  expect(revertRevision(space, change.id)).toEqual({ ok: true });
  expect(space.getText()).toBe("a\nb\nc\nd");
  const last = head(space.timeline.getState())!;
  expect(last).toMatchObject({ source: "revert", from: change.id });
  // "a\nb\nc\nd" was never approved: taking the change out does not
  // approve what was typed on top of it.
  expect(reviewed(space)).toBe(false);
  expect(space.undo.undo()).toBe(true);
  expect(space.getText()).toBe("a\nB\nc\nd");
  expect(reviewed(space)).toBe(false);
});

test("reverting the only change lands on the approved text; undoing that is unreviewed again", async () => {
  const space = await make("a\nb\nc");
  const change = turn(space, "t1", "a\nB\nc");
  expect(reviewed(space)).toBe(false);
  expect(revertRevision(space, change.id)).toEqual({ ok: true });
  expect(space.getText()).toBe("a\nb\nc");
  expect(reviewed(space)).toBe(true);
  space.undo.undo();
  expect(space.getText()).toBe("a\nB\nc");
  expect(reviewed(space)).toBe(false);
  expect(space.markers.getState().approvedText).toBe("a\nb\nc");
});

test("a revert never lands approved on a text the user did not approve", async () => {
  const space = await make("a\nb\nc");
  const first = turn(space, "t1", "a\nB\nc");
  turn(space, "t2", "a\nB\nc\nevil");
  // Reviewed while the assistant's second change was not there yet.
  expect(revertRevision(space, first.id)).toEqual({ ok: true });
  expect(space.getText()).toBe("a\nb\nc\nevil");
  expect(reviewed(space)).toBe(false);
});

test("an overlapping revert is refused and changes nothing", async () => {
  const space = await make("a\nb\nc");
  const change = turn(space, "t1", "a\nB\nc");
  applyText(space.text, "a\nX\nc", ORIGIN.user);
  const before = revisions(space.timeline.getState()).length;
  expect(revertRevision(space, change.id)).toEqual({
    ok: false,
    reason: "conflict",
  });
  expect(space.getText()).toBe("a\nX\nc");
  expect(revisions(space.timeline.getState())).toHaveLength(before);
  // Restore to before goes back wholesale, recording the typing first.
  expect(restoreBefore(space, change.id)).toEqual({ ok: true });
  expect(space.getText()).toBe("a\nb\nc");
  expect(head(space.timeline.getState())).toMatchObject({
    source: "load",
    from: change.id,
  });
  expect(reviewed(space)).toBe(true);
  space.undo.undo();
  expect(space.getText()).toBe("a\nX\nc");
  expect(reviewed(space)).toBe(false);
});

test("without the text before it there is no revert and no restore", async () => {
  const space = await make("a");
  const [first] = revisions(space.timeline.getState());
  const change = turn(space, "t1", "b");
  for (const act of [revertRevision, restoreBefore]) {
    expect(act(space, first.id)).toEqual({ ok: false, reason: "no-parent" });
    expect(act(space, "nothing")).toEqual({ ok: false, reason: "no-parent" });
  }
  space.commit({
    removals: [{ entryId: first.id, by: { kind: "user" }, ts: 9e9 }],
  });
  for (const act of [revertRevision, restoreBefore])
    expect(act(space, change.id)).toEqual({ ok: false, reason: "no-parent" });
  expect(space.getText()).toBe("b");
});
