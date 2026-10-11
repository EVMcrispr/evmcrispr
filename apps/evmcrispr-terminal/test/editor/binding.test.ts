import { expect, test } from "bun:test";
import * as Y from "yjs";
import { applyModelChanges, deltaToEdits } from "../../src/editor/conversions";
import { bindMonaco } from "../../src/editor/monaco-binding";
import { createUndo, ORIGIN } from "../../src/space/undo";
import { FakeEditor, FakeModel, fakeMonaco } from "../helpers/fake-model";

function setup(initial: string) {
  const doc = new Y.Doc();
  const text = doc.getText("script");
  text.insert(0, initial);
  const model = new FakeModel("stale");
  const editor = new FakeEditor(model);
  const binding = bindMonaco(fakeMonaco, model, text, () => [editor]);
  const origins: unknown[] = [];
  doc.on("afterTransaction", (tr: Y.Transaction) => origins.push(tr.origin));
  return { doc, text, model, editor, binding, origins };
}

test("model changes become Y.Text operations: multi-cursor and CRLF", () => {
  const doc = new Y.Doc();
  const text = doc.getText("t");
  text.insert(0, "aaa\nbbb\nccc");
  applyModelChanges(text, [
    { rangeOffset: 0, rangeLength: 0, text: "X" },
    { rangeOffset: 4, rangeLength: 0, text: "X" },
    { rangeOffset: 8, rangeLength: 3, text: "one\r\ntwo" },
  ]);
  expect(text.toString()).toBe("Xaaa\nXbbb\none\ntwo");
});

test("a delta becomes sequential edits", () => {
  const edits = deltaToEdits([
    { retain: 2 },
    { delete: 3 },
    { insert: "xy" },
    { retain: 1 },
    { insert: "z" },
  ]);
  let s = "0123456";
  for (const e of edits)
    s = s.slice(0, e.offset) + e.text + s.slice(e.offset + e.length);
  expect(s).toBe("01xy5z6");
});

test("the model starts from the document", () => {
  expect(setup("exec 1").model.getValue()).toBe("exec 1");
});

test("typing reaches the document as the user's and can be undone", () => {
  const { text, model } = setup("exec 1");
  const undo = createUndo(text);
  model.type({ rangeOffset: 6, rangeLength: 0, text: "\nexec 2" });
  expect(text.toString()).toBe("exec 1\nexec 2");
  undo.undo();
  expect(text.toString()).toBe("exec 1");
  expect(model.getValue()).toBe("exec 1");
});

test("a multi-cursor paste with CRLF leaves the document LF-only and equal to the model", () => {
  const { text, model } = setup("aaa\nbbb");
  model.type(
    { rangeOffset: 0, rangeLength: 0, text: "x\r\ny" },
    { rangeOffset: 4, rangeLength: 3, text: "x\r\ny" },
  );
  expect(text.toString()).toBe("x\nyaaa\nx\ny");
  expect(model.getValue()).toBe(text.toString());
});

test("a change from elsewhere reaches the model and keeps the selection in place", () => {
  const { doc, text, model, editor } = setup("exec 1\nexec 2");
  editor.select(7, 13);
  doc.transact(() => text.insert(0, "# Title\n"), ORIGIN.assistant);
  expect(model.getValue()).toBe("# Title\nexec 1\nexec 2");
  const s = editor.selection!;
  expect([s.sl, s.sc, s.el, s.ec]).toEqual([3, 1, 3, 7]);
});

test("after dispose nothing flows", () => {
  const { text, model, binding } = setup("a");
  binding.dispose();
  text.insert(1, "b");
  model.type({ rangeOffset: 0, rangeLength: 0, text: "z" });
  expect(model.getValue()).toBe("za");
  expect(text.toString()).toBe("ab");
});

test("an ordinary edit of the model is the user's; a flush or a native undo or redo is neutral", () => {
  const { text, model, origins } = setup("exec 1");
  model.type({ rangeOffset: 6, rangeLength: 0, text: "\nexec 2" });
  model.setValue("exec 3");
  model.edit([{ rangeOffset: 5, rangeLength: 1, text: "4" }], {
    isUndoing: true,
  });
  model.edit([{ rangeOffset: 5, rangeLength: 1, text: "5" }], {
    isRedoing: true,
  });
  expect(text.toString()).toBe("exec 5");
  expect(model.getValue()).toBe("exec 5");
  expect(origins).toEqual([
    ORIGIN.user,
    ORIGIN.neutral,
    ORIGIN.neutral,
    ORIGIN.neutral,
  ]);
});

test("a change of line endings changes nothing in the document", () => {
  const { text, model, origins } = setup("one\ntwo");
  model.changeEol();
  expect(text.toString()).toBe("one\ntwo");
  expect(origins).toEqual([]);
});

test("a document change that arrives while typing is applied is not lost", () => {
  const { doc, text, model } = setup("a");
  doc.once("afterTransaction", () => {
    doc.transact(() => text.insert(0, "remote "), ORIGIN.remote);
  });
  model.type({ rangeOffset: 1, rangeLength: 0, text: "b" });
  expect(text.toString()).toBe("remote ab");
  expect(model.getValue()).toBe("remote ab");
});

test("a model edit made while a document change is applied does not leave them apart", () => {
  const { doc, text, model } = setup("a");
  let once = true;
  model.onDidChangeContent(() => {
    if (!once) return;
    once = false;
    model.type({ rangeOffset: 0, rangeLength: 0, text: "sneaked " });
  });
  doc.transact(() => text.insert(1, "b"), ORIGIN.assistant);
  expect(model.getValue()).toBe(text.toString());
  expect(text.toString()).toBe("ab");
});

test("after any sequence the model equals the document", () => {
  const { doc, text, model } = setup("one\ntwo");
  const steps = [
    () => model.type({ rangeOffset: 0, rangeLength: 3, text: "ONE" }),
    () => doc.transact(() => text.insert(3, "!"), ORIGIN.assistant),
    () => model.setValue("flushed\r\nlines"),
    () => model.type({ rangeOffset: 0, rangeLength: 0, text: "p\r\n" }),
    () => model.changeEol(),
    () => doc.transact(() => text.delete(0, 2), ORIGIN.remote),
    () =>
      model.edit([{ rangeOffset: 0, rangeLength: 1, text: "" }], {
        isUndoing: true,
      }),
  ];
  for (const step of steps) {
    step();
    expect(model.getValue()).toBe(text.toString());
    expect(text.toString()).not.toContain("\r");
  }
});
