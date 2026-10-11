import { beforeEach, expect, test } from "bun:test";
import { applyText, head, isReviewed, revisions } from "@evmcrispr/space";
import type { App } from "../../src/app/boot";
import { spaceFromEntry, spaceFromProgram } from "../../src/space/derive";
import type { LiveSpace } from "../../src/space/live-space";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";
import { settle } from "../helpers/tabs";

let app: App;
let source: LiveSpace;

beforeEach(async () => {
  app = testBrowser().tab();
  const id = await app.spaces.create({ text: "exec 1", source: "user" });
  source = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
});

async function state(id: string) {
  const space = (await app.spaces.acquire(id))!;
  await settle();
  return {
    reviewed: isReviewed(
      space.getText(),
      space.markers.getState().approvedText,
    ),
    approvedText: space.markers.getState().approvedText,
    listed: app.spaces.index.getState().find((m) => m.id === id)?.unreviewed,
    space,
  };
}

test("a space the user makes still starts approved", async () => {
  const made = await state(
    await app.spaces.create({ text: "x", source: "user" }),
  );
  expect(made).toMatchObject({ reviewed: true, listed: false });
});

test("from a chat card (a snippet, a simulation): unreviewed, and listed so", async () => {
  const made = await state(await spaceFromProgram(app.spaces, "exec 666"));
  expect(made.space.getText()).toBe("exec 666");
  expect(made.approvedText).toBeUndefined();
  expect(made).toMatchObject({ reviewed: false, listed: true });
  // Typing in it does not approve what was there.
  applyText(made.space.text, "exec 666\nprint mine", ORIGIN.user);
  expect(made.space.markers.getState().approvedText).toBeUndefined();
  // And it is kept so across a reload of the space.
  expect(
    (await app.storage.records.getMarkers(made.space.id)).approvedText,
  ).toBeUndefined();
});

test("from a revision whose text is the approved text: approved", async () => {
  const entry = head(source.timeline.getState())!;
  const made = await state(
    await spaceFromEntry(app.spaces, source, entry.text),
  );
  expect(made).toMatchObject({ reviewed: true, listed: false });
});

test("from a revision whose text was approved earlier in this page: approved", async () => {
  const first = head(source.timeline.getState())!;
  applyText(source.text, "exec 1\nprint more", ORIGIN.user);
  source.record("user");
  const made = await state(
    await spaceFromEntry(app.spaces, source, first.text),
  );
  expect(made.reviewed).toBe(true);
});

test("from an assistant revision not yet approved: unreviewed", async () => {
  source.editAsTurn("t1", { kind: "write", text: "exec 666" });
  const revision = source.endTurn("t1")!;
  expect(revision.source).toBe("assistant");
  const made = await state(
    await spaceFromEntry(app.spaces, source, revision.text),
  );
  expect(made).toMatchObject({ reviewed: false, listed: true });
  expect(made.approvedText).toBeUndefined();
});

test("an entry that claims the user as author, with a text never approved: unreviewed", async () => {
  // As a copy of the space from elsewhere could deliver it.
  source.editAsTurn("t1", { kind: "write", text: "exec 666" });
  source.endTurn("t1");
  const forged = { ...head(source.timeline.getState())! };
  expect(revisions(source.timeline.getState()).length).toBe(2);
  forged.author = { kind: "user" };
  forged.source = "user";
  const made = await state(
    await spaceFromEntry(app.spaces, source, forged.text),
  );
  expect(made).toMatchObject({ reviewed: false, listed: true });
});
