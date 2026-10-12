import type { ModelChange } from "../../src/editor/conversions";
import type {
  EditorLike,
  ModelEvent,
  ModelLike,
  MonacoLike,
} from "../../src/editor/monaco-binding";

class Range {
  constructor(
    public sl: number,
    public sc: number,
    public el: number,
    public ec: number,
  ) {}
}
class Selection extends Range {
  direction = 0;
  getStartPosition() {
    return { lineNumber: this.sl, column: this.sc };
  }
  getEndPosition() {
    return { lineNumber: this.el, column: this.ec };
  }
  getDirection() {
    return this.direction;
  }
}

export const fakeMonaco: MonacoLike = {
  Range,
  Selection: {
    createWithDirection(sl, sc, el, ec, direction) {
      const s = new Selection(sl, sc, el, ec);
      s.direction = direction;
      return s;
    },
  },
  editor: { EndOfLineSequence: { LF: 0 } },
};

type Flags = Partial<Omit<ModelEvent, "changes">>;

/** A string-backed stand-in for a Monaco text model. Like Monaco, every
 *  way of changing it tells the content listeners, synchronously. */
export class FakeModel implements ModelLike {
  #listeners = new Set<(event: ModelEvent) => void>();
  constructor(public value = "") {}
  #emit(changes: ModelChange[], flags: Flags = {}) {
    const event = {
      changes,
      isFlush: false,
      isUndoing: false,
      isRedoing: false,
      isEolChange: false,
      ...flags,
    };
    for (const listener of [...this.#listeners]) listener(event);
  }
  getValue() {
    return this.value;
  }
  setValue(value: string) {
    this.value = value;
    this.#emit([], { isFlush: true });
  }
  setEOL() {}
  /** Another piece of code switches the model to CRLF. */
  changeEol() {
    this.#emit([], { isEolChange: true });
  }
  getPositionAt(offset: number) {
    const before = this.value.slice(0, offset).split("\n");
    return {
      lineNumber: before.length,
      column: before[before.length - 1].length + 1,
    };
  }
  getOffsetAt({ lineNumber, column }: { lineNumber: number; column: number }) {
    const lines = this.value.split("\n");
    return (
      lines.slice(0, lineNumber - 1).reduce((n, l) => n + l.length + 1, 0) +
      column -
      1
    );
  }
  applyEdits(edits: { range: unknown; text: string }[]) {
    for (const { range, text } of edits) {
      const r = range as Range;
      const from = this.getOffsetAt({ lineNumber: r.sl, column: r.sc });
      const to = this.getOffsetAt({ lineNumber: r.el, column: r.ec });
      this.value = this.value.slice(0, from) + text + this.value.slice(to);
      this.#emit([{ rangeOffset: from, rangeLength: to - from, text }]);
    }
  }
  onDidChangeContent(listener: (event: ModelEvent) => void) {
    this.#listeners.add(listener);
    return { dispose: () => void this.#listeners.delete(listener) };
  }
  /** An edit as Monaco reports it, whoever made it: changes are in
   *  pre-change offsets. `flags` makes it a native undo or redo. */
  type(...changes: ModelChange[]) {
    this.edit(changes);
  }
  edit(changes: ModelChange[], flags: Flags = {}) {
    for (const c of [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset))
      this.value =
        this.value.slice(0, c.rangeOffset) +
        c.text.replace(/\r\n?/g, "\n") +
        this.value.slice(c.rangeOffset + c.rangeLength);
    this.#emit(changes, flags);
  }
}

export class FakeEditor implements EditorLike {
  selection: Selection | null = null;
  constructor(public model: FakeModel) {}
  getModel() {
    return this.model;
  }
  getSelection() {
    return this.selection;
  }
  setSelection(selection: unknown) {
    this.selection = selection as Selection;
  }
  select(from: number, to: number) {
    const a = this.model.getPositionAt(from);
    const b = this.model.getPositionAt(to);
    this.selection = new Selection(
      a.lineNumber,
      a.column,
      b.lineNumber,
      b.column,
    );
  }
}
