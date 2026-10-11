import { expect, test } from "bun:test";
import * as Y from "yjs";
import { changeKind, createUndo, ORIGIN } from "../../src/space/undo";

function setup(initial = "") {
  const doc = new Y.Doc();
  const text = doc.getText("script");
  doc.transact(() => text.insert(0, initial), "init");
  const undo = createUndo(text);
  const type = (at: number, s: string, origin: string = ORIGIN.user) =>
    doc.transact(() => text.insert(at, s), origin);
  return { doc, text, undo, type };
}

test("typing and a turn undo, the turn as one step; redo", () => {
  const { text, undo, type } = setup("a");
  type(1, "b");
  undo.asTurn("t1", () => type(2, "c", ORIGIN.assistant));
  undo.asTurn("t1", () => type(3, "d", ORIGIN.assistant));
  undo.endTurn();
  expect(text.toString()).toBe("abcd");
  undo.undo();
  expect(text.toString()).toBe("ab");
  undo.undo();
  expect(text.toString()).toBe("a");
  undo.redo();
  undo.redo();
  expect(text.toString()).toBe("abcd");
});

test("typing in the middle of a turn splits it", () => {
  const { text, undo, type } = setup("");
  undo.asTurn("t1", () => type(0, "A", ORIGIN.assistant));
  type(1, "u");
  undo.asTurn("t1", () => type(2, "B", ORIGIN.assistant));
  undo.endTurn();
  undo.undo();
  expect(text.toString()).toBe("Au");
});

test("two turns are two steps", () => {
  const { text, undo, type } = setup("");
  undo.asTurn("t1", () => type(0, "A", ORIGIN.assistant));
  undo.endTurn();
  undo.asTurn("t2", () => type(1, "B", ORIGIN.assistant));
  undo.endTurn();
  undo.undo();
  expect(text.toString()).toBe("A");
});

test("an update from an untracked origin is not undone", () => {
  const { text, undo, type } = setup("");
  type(0, "mine");
  type(0, "theirs ", ORIGIN.remote);
  undo.undo();
  expect(text.toString()).toBe("theirs ");
  undo.undo();
  expect(text.toString()).toBe("theirs ");
});

test("a load is its own step even right after typing", () => {
  const { text, undo, type, doc } = setup("");
  type(0, "typed");
  undo.asStep(() =>
    doc.transact(() => {
      text.delete(0, text.length);
      text.insert(0, "loaded");
    }, ORIGIN.load),
  );
  type(6, "!");
  undo.undo();
  expect(text.toString()).toBe("loaded");
  undo.undo();
  expect(text.toString()).toBe("typed");
});

test("undo and redo report whether they changed the script", () => {
  const { text, undo, type } = setup("");
  expect(undo.undo()).toBe(false);
  type(0, "mine");
  expect(undo.redo()).toBe(false);
  expect(undo.undo()).toBe(true);
  expect(undo.redo()).toBe(true);
  expect(text.toString()).toBe("mine");
});

test("what each origin is to the review marker; an unknown one is foreign", () => {
  const kinds = Object.fromEntries(
    Object.values(ORIGIN).map((origin) => [origin, changeKind(origin)]),
  );
  expect(kinds).toEqual({
    user: "own",
    load: "neutral",
    neutral: "neutral",
    assistant: "foreign",
    remote: "foreign",
  });
  expect([changeKind("made up"), changeKind(null)]).toEqual([
    "foreign",
    "foreign",
  ]);
});
