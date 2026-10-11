import { expect, test } from "bun:test";
import { isReviewed } from "@evmcrispr/space";
import { bindMonaco } from "../../src/editor/monaco-binding";
import { createSpaces } from "../../src/space/spaces";
import { tabTransport } from "../../src/space/tab-transport";
import { createChanges } from "../../src/storage/changes";
import { memoryStorage } from "../../src/storage/index";
import { localLocks } from "../../src/storage/locks";
import { FakeModel, fakeMonaco } from "../helpers/fake-model";
import { channelHub } from "../helpers/tabs";

/** A space on screen in an editor. */
async function onScreen(initial: string) {
  const hub = channelHub();
  const spaces = createSpaces({
    storage: memoryStorage(),
    transport: tabTransport(hub),
    changes: createChanges(hub),
    locks: localLocks(),
    now: Date.now,
    me: () => ({ kind: "user" }),
  });
  const space = (await spaces.acquire(
    await spaces.create({ text: initial, source: "user" }),
  ))!;
  const model = new FakeModel(initial);
  bindMonaco(fakeMonaco, model, space.text, () => []);
  const reviewed = () =>
    isReviewed(space.getText(), space.markers.getState().approvedText);
  const append = (text: string) =>
    model.type({ rangeOffset: model.getValue().length, rangeLength: 0, text });
  const assistant = (from: string, to: string) => {
    space.editAsTurn("t", { kind: "replace", oldString: from, newString: to });
    space.endTurn("t");
  };
  return { space, model, reviewed, append, assistant };
}

test("typing, a paste in several places and an auto-import on an approved text stay reviewed", async () => {
  const t = await onScreen("exec 1\nexec 2");
  t.append("\nexec 3");
  // A multi-cursor paste: several changes in one event.
  t.model.type(
    { rangeOffset: 0, rangeLength: 0, text: "x\r\n" },
    { rangeOffset: 7, rangeLength: 0, text: "y\r\n" },
  );
  // What auto-import does: the editor rewrites what was just typed.
  t.model.type({ rangeOffset: 0, rangeLength: 1, text: "load std\n" });
  expect(t.model.getValue()).toBe(t.space.getText());
  expect(t.reviewed()).toBe(true);
});

test("an assistant turn on an approved text is unreviewed, and stays so through the user's typing", async () => {
  const t = await onScreen("exec 1");
  t.assistant("exec 1", "exec 666");
  expect(t.model.getValue()).toBe("exec 666");
  expect(t.reviewed()).toBe(false);
  t.append("\nexec 2");
  expect(t.reviewed()).toBe(false);
  expect(t.space.markers.getState().approvedText).toBe("exec 1");
});

test("a flush is judged by where it lands: a text never approved is unreviewed", async () => {
  const t = await onScreen("exec 1");
  t.model.setValue("exec 666");
  expect(t.space.getText()).toBe("exec 666");
  expect(t.reviewed()).toBe(false);
  expect(t.space.markers.getState().approvedText).toBe("exec 1");
});

test("a flush or a native undo back to a text that was approved is reviewed", async () => {
  const t = await onScreen("exec 1");
  t.append("\nexec 2");
  t.model.setValue("exec 1");
  expect(t.reviewed()).toBe(true);
  t.model.edit([{ rangeOffset: 6, rangeLength: 0, text: "\nexec 2" }], {
    isRedoing: true,
  });
  expect(t.reviewed()).toBe(true);
  t.model.edit([{ rangeOffset: 6, rangeLength: 0, text: "6" }], {
    isUndoing: true,
  });
  expect(t.reviewed()).toBe(false);
});

test("a native redo cannot bring back what the assistant wrote as reviewed", async () => {
  const t = await onScreen("exec 1");
  t.assistant("exec 1", "exec 666");
  t.space.undo.undo();
  expect(t.reviewed()).toBe(true);
  t.model.edit([{ rangeOffset: 5, rangeLength: 1, text: "666" }], {
    isRedoing: true,
  });
  expect(t.space.getText()).toBe("exec 666");
  expect(t.reviewed()).toBe(false);
});

test("a change of line endings leaves the script and its review alone", async () => {
  const t = await onScreen("exec 1\nexec 2");
  t.model.changeEol();
  expect(t.space.getText()).toBe("exec 1\nexec 2");
  expect(t.reviewed()).toBe(true);
});
