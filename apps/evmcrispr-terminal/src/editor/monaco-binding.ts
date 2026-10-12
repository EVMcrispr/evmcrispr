// A port of y-monaco (https://github.com/yjs/y-monaco, MIT, © Kevin Jahns):
// the same two-way binding between a `Y.Text` and a Monaco model, taking the
// `monaco` instance as a parameter instead of importing Monaco's ESM build
// (the editor here is the AMD build served from /vs). Awareness (other
// people's cursors) is not ported yet.
import { applyText } from "@evmcrispr/space";
import * as Y from "yjs";
import { ORIGIN } from "../space/undo";
import {
  applyModelChanges,
  deltaToEdits,
  type ModelChange,
} from "./conversions";

interface Position {
  lineNumber: number;
  column: number;
}
interface Disposable {
  dispose(): void;
}
/** The part of Monaco's `IModelContentChangedEvent` the binding uses. */
export interface ModelEvent {
  changes: ModelChange[];
  /** The whole content was replaced (`setValue`). */
  isFlush: boolean;
  /** Monaco's own undo or redo. Ctrl+Z belongs to the space, but the
   *  editor's stack can still be reached (a menu, the browser's). */
  isUndoing: boolean;
  isRedoing: boolean;
  isEolChange: boolean;
}
/** The part of `monaco.editor.ITextModel` the binding uses. */
export interface ModelLike {
  getValue(): string;
  setValue(value: string): void;
  setEOL(eol: number): void;
  getPositionAt(offset: number): Position;
  getOffsetAt(position: Position): number;
  applyEdits(edits: { range: never; text: string }[]): unknown;
  onDidChangeContent(listener: (event: ModelEvent) => void): Disposable;
}
/** The part of `monaco.editor.ICodeEditor` the binding uses. */
export interface EditorLike {
  getModel(): unknown;
  getSelection(): {
    getStartPosition(): Position;
    getEndPosition(): Position;
    getDirection(): number;
  } | null;
  setSelection(selection: never): void;
}
/** The part of the `monaco` namespace the binding uses. */
export interface MonacoLike {
  Range: new (sl: number, sc: number, el: number, ec: number) => unknown;
  Selection: {
    createWithDirection(
      sl: number,
      sc: number,
      el: number,
      ec: number,
      direction: number,
    ): unknown;
  };
  editor: { EndOfLineSequence: { LF: number } };
}

/**
 * Keeps `model` and `text` equal, the document being the truth.
 *
 * An edit of the model goes to the document as the user's
 * (`ORIGIN.user`): what anyone else writes enters through the space and
 * never through an editor. The changes of the model that are nobody's
 * writing are told apart by the flags Monaco puts on them and tagged
 * `ORIGIN.neutral`: its content replaced, its own undo or redo. A change
 * of line endings changes nothing: the document only holds LF.
 *
 * Every other change to the document is applied to the model with
 * `applyEdits`, which stays off Monaco's own undo stack, and the selection
 * of each editor showing the model is kept in place.
 */
export function bindMonaco(
  monaco: MonacoLike,
  model: ModelLike,
  text: Y.Text,
  editors: () => EditorLike[],
): Disposable & {
  /** Empties the model's own undo stack (the one behind the editor's
   *  menus), leaving its text as it is. */
  forgetUndo(): void;
} {
  const doc = text.doc as Y.Doc;
  // What the binding itself is doing, so that it knows its own echo: the
  // model events its writes to the model raise, and the document event of
  // the transaction it wrote. Nothing else is ever skipped.
  let writingModel = false;
  let written: Y.Transaction | null = null;

  const toModel = (write: () => void) => {
    const outer = writingModel;
    writingModel = true;
    try {
      write();
    } finally {
      writingModel = outer;
    }
  };
  /** Puts the model back to what the document says, when they differ. It
   *  writes the model only, so it is nobody's change to the script. */
  const resync = () => {
    toModel(() => {
      model.setEOL(monaco.editor.EndOfLineSequence.LF);
      if (model.getValue() !== text.toString()) model.setValue(text.toString());
    });
  };
  resync();

  const saved = new Map<
    EditorLike,
    { start: Y.RelativePosition; end: Y.RelativePosition; direction: number }
  >();
  const beforeTransaction = () => {
    saved.clear();
    // The model is ahead of the document while typing is on its way in.
    if (model.getValue() !== text.toString()) return;
    for (const editor of editors()) {
      const selection =
        editor.getModel() === model ? editor.getSelection() : null;
      if (!selection) continue;
      const at = (position: Position) =>
        Y.createRelativePositionFromTypeIndex(
          text,
          model.getOffsetAt(position),
        );
      saved.set(editor, {
        start: at(selection.getStartPosition()),
        end: at(selection.getEndPosition()),
        direction: selection.getDirection(),
      });
    }
  };
  doc.on("beforeAllTransactions", beforeTransaction);

  const onText = (event: Y.YTextEvent) => {
    if (event.transaction === written) return;
    toModel(() => {
      for (const edit of deltaToEdits(event.delta)) {
        const from = model.getPositionAt(edit.offset);
        const to = model.getPositionAt(edit.offset + edit.length);
        model.applyEdits([
          {
            range: new monaco.Range(
              from.lineNumber,
              from.column,
              to.lineNumber,
              to.column,
            ) as never,
            text: edit.text,
          },
        ]);
      }
    });
    // Equal unless a conversion is wrong or something edited the model
    // meanwhile; either way the document is the truth.
    resync();
    for (const [editor, selection] of saved) {
      const start = Y.createAbsolutePositionFromRelativePosition(
        selection.start,
        doc,
      );
      const end = Y.createAbsolutePositionFromRelativePosition(
        selection.end,
        doc,
      );
      if (!start || !end || editor.getModel() !== model) continue;
      const from = model.getPositionAt(start.index);
      const to = model.getPositionAt(end.index);
      editor.setSelection(
        monaco.Selection.createWithDirection(
          from.lineNumber,
          from.column,
          to.lineNumber,
          to.column,
          selection.direction,
        ) as never,
      );
    }
  };
  text.observe(onText);

  /** Writes to the document in a transaction of the binding's own, whose
   *  echo `onText` skips. */
  const toDocument = (origin: string, write: () => void) => {
    doc.transact((transaction) => {
      // A transaction already under way is somebody else's: its event
      // has to reach the model, and its origin is not ours to set.
      if (transaction.origin === origin) written = transaction;
      write();
    }, origin);
    written = null;
  };

  const onModel = model.onDidChangeContent((event) => {
    if (writingModel) return;
    if (event.isFlush)
      toDocument(ORIGIN.neutral, () =>
        applyText(text, model.getValue(), ORIGIN.neutral),
      );
    else if (!event.isEolChange)
      toDocument(
        event.isUndoing || event.isRedoing ? ORIGIN.neutral : ORIGIN.user,
        () => applyModelChanges(text, event.changes),
      );
    resync();
  });

  return {
    forgetUndo() {
      // Replacing the content, even with itself, empties the model's own
      // stack. It writes the model only: the script is not changed.
      const selections = editors().map(
        (editor) =>
          [
            editor,
            editor.getModel() === model ? editor.getSelection() : null,
          ] as const,
      );
      toModel(() => model.setValue(text.toString()));
      for (const [editor, selection] of selections)
        if (selection) editor.setSelection(selection as never);
    },
    dispose() {
      onModel.dispose();
      text.unobserve(onText);
      doc.off("beforeAllTransactions", beforeTransaction);
    },
  };
}
