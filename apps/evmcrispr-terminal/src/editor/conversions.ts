import { normalizeEol } from "@evmcrispr/space";
import type * as Y from "yjs";

/** One change of a Monaco `IModelContentChangedEvent`. */
export interface ModelChange {
  rangeOffset: number;
  rangeLength: number;
  text: string;
}

/** Applies a Monaco content event to the `Y.Text`, highest offset first so
 *  the offsets of the remaining changes stay valid (multi-cursor edits). */
export function applyModelChanges(
  text: Y.Text,
  changes: readonly ModelChange[],
): void {
  for (const change of [...changes].sort(
    (a, b) => b.rangeOffset - a.rangeOffset,
  )) {
    if (change.rangeLength) text.delete(change.rangeOffset, change.rangeLength);
    // The model is LF; a pasted CRLF must not put a CR in the document.
    const inserted = normalizeEol(change.text);
    if (inserted) text.insert(change.rangeOffset, inserted);
  }
}

/** An edit at an offset of the text as it stands after the edits before it. */
export interface OffsetEdit {
  offset: number;
  length: number;
  text: string;
}

type DeltaOp = { retain?: number; insert?: unknown; delete?: number };

/** A `Y.Text` delta as edits to apply to the model, in order. */
export function deltaToEdits(delta: readonly DeltaOp[]): OffsetEdit[] {
  const edits: OffsetEdit[] = [];
  let offset = 0;
  for (const op of delta) {
    if (op.retain !== undefined) offset += op.retain;
    else if (typeof op.insert === "string") {
      edits.push({ offset, length: 0, text: op.insert });
      offset += op.insert.length;
    } else if (op.delete !== undefined)
      edits.push({ offset, length: op.delete, text: "" });
  }
  return edits;
}
