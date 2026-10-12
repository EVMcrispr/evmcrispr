// Taking a recorded change back from its row. Both go through
// `LiveSpace.load`: the result is judged by where it lands like any load
// (never approved for having been chosen), is one step for Ctrl+Z, and
// records a revision that names the revision acted on.
import { revertChange } from "@evmcrispr/space";
import type { LiveSpace } from "../space/live-space";

export type UndoOutcome =
  | { ok: true }
  /** Later edits touch the same lines. */
  | { ok: false; reason: "conflict" }
  /** The revision, or the one before it, is no longer kept. */
  | { ok: false; reason: "no-parent" };

function pair(space: LiveSpace, revisionId: string) {
  const { entries } = space.timeline.getState();
  const revision = entries.get(revisionId);
  if (revision?.kind !== "revision" || !revision.parent) return null;
  const parent = entries.get(revision.parent);
  return parent?.kind === "revision" ? { revision, parent } : null;
}

/** Removes that revision's change from the script and keeps what was made
 *  after it. Changes nothing when later edits touch the same lines. */
export function revertRevision(
  space: LiveSpace,
  revisionId: string,
): UndoOutcome {
  const found = pair(space, revisionId);
  if (!found) return { ok: false, reason: "no-parent" };
  const next = revertChange(
    space.getText(),
    found.revision.text,
    found.parent.text,
  );
  if (next === null) return { ok: false, reason: "conflict" };
  space.load(next, "revert", revisionId);
  return { ok: true };
}

/** Loads the revision before that one. */
export function restoreBefore(
  space: LiveSpace,
  revisionId: string,
): UndoOutcome {
  const found = pair(space, revisionId);
  if (!found) return { ok: false, reason: "no-parent" };
  space.load(found.parent.text, "load", revisionId);
  return { ok: true };
}
