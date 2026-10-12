import { expect, test } from "bun:test";
import { applyText, head, isReviewed, revisions } from "@evmcrispr/space";
import type { LiveSpace } from "../../src/space/live-space";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";
import { fakeEvml } from "../helpers/fake-evml";
import { settle } from "../helpers/tabs";

const reviewed = (space: LiveSpace) =>
  isReviewed(space.getText(), space.markers.getState().approvedText);
/** An assistant turn that leaves the script as `text`. */
export const turn = (space: LiveSpace, id: string, text: string) => {
  space.editAsTurn(id, { kind: "write", text });
  return space.endTurn(id);
};

async function setup(text = "print 1") {
  const browser = testBrowser();
  const evml = fakeEvml([{ line: 1 }], async () => ({}));
  const app = browser.tab({ evml: () => evml });
  const id = await app.spaces.create({ text, source: "user" });
  const space = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
  return { browser, app, evml, id, space };
}

test("an unreviewed space refuses a real run and allows a simulated one", async () => {
  const t = await setup();
  turn(t.space, "t1", "exec evil");
  expect(await t.app.runs.start(t.id, { mode: "real" })).toEqual({
    ok: false,
    reason: "unreviewed",
  });
  expect(t.evml.source).toBe("");
  const simulated = await t.app.runs.start(t.id, { mode: "simulated" });
  expect(simulated.ok).toBe(true);
  if (simulated.ok) await simulated.ended;
  expect(t.evml.source).toBe("exec evil");
});

test("typing after an assistant edit does not unblock", async () => {
  const t = await setup();
  turn(t.space, "t1", "exec evil");
  applyText(t.space.text, "exec evil\nprint mine", ORIGIN.user);
  t.space.record("user");
  expect(await t.app.runs.start(t.id, { mode: "real" })).toMatchObject({
    reason: "unreviewed",
  });
});

test("a space with nothing approved refuses a real run until its whole text is approved", async () => {
  const t = await setup();
  const id = await t.app.spaces.create({
    text: "exec made",
    source: "import",
    unreviewed: true,
  });
  const space = (await t.app.spaces.acquire(id))!;
  t.app.spaces.show(id);
  expect(await t.app.runs.start(id, { mode: "real" })).toMatchObject({
    reason: "unreviewed",
  });
  expect(space.approve("exec made")).toBe(true);
  const started = await t.app.runs.start(id, { mode: "real" });
  expect(started.ok).toBe(true);
});

test("the gate is not talked open by an entry that claims to be the user's latest", async () => {
  const t = await setup();
  turn(t.space, "t1", "exec evil");
  const { revisionId } = await import("@evmcrispr/space");
  const last = head(t.space.timeline.getState())!;
  t.space.commit({
    entries: [
      {
        kind: "revision",
        id: revisionId("exec evil\n", last.id),
        parent: last.id,
        text: "exec evil\n",
        source: "user",
        author: { kind: "user" },
        ts: 9e15,
      },
    ],
  });
  expect(await t.app.runs.start(t.id, { mode: "real" })).toMatchObject({
    reason: "unreviewed",
  });
});

test("Approve approves the text it was shown, and only while that is the script", async () => {
  const t = await setup();
  turn(t.space, "t1", "exec 2");
  const shown = t.space.getText();
  turn(t.space, "t2", "exec 3");
  expect(t.space.approve(shown)).toBe(false);
  expect(reviewed(t.space)).toBe(false);
  expect(t.space.markers.getState().approvedText).toBe("print 1");

  expect(t.space.approve("exec 3")).toBe(true);
  expect(reviewed(t.space)).toBe(true);
  const started = await t.app.runs.start(t.id, { mode: "real" });
  expect(started.ok).toBe(true);
  if (started.ok) await started.ended;
  expect(t.evml.source).toBe("exec 3");
  // A further assistant edit brings the gate back.
  turn(t.space, "t3", "exec 4");
  expect(await t.app.runs.start(t.id, { mode: "real" })).toMatchObject({
    reason: "unreviewed",
  });
});

test("Approve records typing that was not yet a revision", async () => {
  const t = await setup();
  turn(t.space, "t1", "exec 2");
  applyText(t.space.text, "exec 2\nprint mine", ORIGIN.user);
  expect(t.space.approve("exec 2\nprint mine")).toBe(true);
  expect(head(t.space.timeline.getState())?.text).toBe("exec 2\nprint mine");
  expect(revisions(t.space.timeline.getState())).toHaveLength(3);
});

test("the approved text cannot be set through the other marks", async () => {
  const t = await setup();
  turn(t.space, "t1", "exec evil");
  await t.space.setMarkers({
    revisionChats: { x: "chat" },
    approvedText: "exec evil",
    turnPending: true,
  } as Parameters<LiveSpace["setMarkers"]>[0]);
  expect(t.space.markers.getState().approvedText).toBe("print 1");
  expect(t.space.markers.getState().turnPending).toBeFalsy();
  expect(reviewed(t.space)).toBe(false);
});

test("a run bound to a text is refused when the script is no longer that text", async () => {
  const t = await setup();
  for (const mode of ["real", "simulated"] as const)
    expect(await t.app.runs.start(t.id, { mode, text: "print 0" })).toEqual({
      ok: false,
      reason: "changed",
    });
  const started = await t.app.runs.start(t.id, {
    mode: "simulated",
    text: "print 1",
  });
  expect(started.ok).toBe(true);
});

test("approving in one tab approves in the other, which may then run", async () => {
  const t = await setup();
  const other = t.browser.tab();
  const there = (await other.spaces.acquire(t.id))!;
  other.spaces.show(t.id);
  turn(t.space, "t1", "exec 2");
  await settle();
  expect(there.getText()).toBe("exec 2");
  expect(reviewed(there)).toBe(false);
  expect(await other.runs.start(t.id, { mode: "real" })).toMatchObject({
    reason: "unreviewed",
  });
  expect(t.space.approve("exec 2")).toBe(true);
  await settle();
  expect(reviewed(there)).toBe(true);
  const started = await other.runs.start(t.id, { mode: "real" });
  expect(started.ok).toBe(true);
});

test("only the approved text is shared, and nothing is pinned otherwise", async () => {
  const { shareScript } = await import("../../src/space/links");
  const t = await setup();
  const pinned: unknown[] = [];
  const deps = {
    pin: async (envelope: unknown) => {
      pinned.push(envelope);
      return { IpfsHash: "Qm" };
    },
    origin: "https://x",
    viewMode: "edit" as const,
  };
  turn(t.space, "t1", "exec evil");
  expect(await shareScript(t.space, t.space.getText(), deps)).toEqual({
    ok: false,
    reason: "unreviewed",
  });
  expect(pinned).toEqual([]);
  // An older revision's text is not the approved text either once the
  // user approved the new one.
  t.space.approve("exec evil");
  expect(await shareScript(t.space, "print 1", deps)).toMatchObject({
    ok: false,
  });
  expect(await shareScript(t.space, "exec evil", deps)).toMatchObject({
    ok: true,
    cid: "Qm",
  });
  expect(pinned).toHaveLength(1);
});
