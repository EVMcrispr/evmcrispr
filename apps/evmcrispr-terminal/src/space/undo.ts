import type { ChangeKind } from "@evmcrispr/space";
import * as Y from "yjs";

/** Who wrote a change to the script. Tags Yjs transactions. */
export const ORIGIN = {
  /** The person at this tab: typing, paste, drop. */
  user: "user",
  /** A program acting for them: the assistant (later, their agents). */
  assistant: "assistant",
  /** Loading an entry, reverting a change, restoring. The text comes
   *  from a record, so it is nobody's writing: judged by where it lands. */
  load: "load",
  /** Nobody's writing, a move between states: the editor's content was
   *  replaced, or its own undo ran. Judged by where it lands. */
  neutral: "neutral",
  /** Another tab or (later) another member. Never undone here. */
  remote: "remote",
} as const;

/** What a change tagged `origin` is to the review marker. Only typing
 *  in the editor is the user's own writing. A load puts back a recorded
 *  text, which may be one a program wrote, so like an undo it is neutral.
 *  Anything else, known or not, is someone else's writing. */
export function changeKind(origin: unknown): ChangeKind {
  if (origin === ORIGIN.user) return "own";
  return origin === ORIGIN.neutral || origin === ORIGIN.load
    ? "neutral"
    : "foreign";
}

export interface SpaceUndo {
  /** Both report whether they changed the script. */
  undo(): boolean;
  redo(): boolean;
  /** An edit by a program acting for the user. Edits of one turn are one
   *  step, unless the user typed in between. */
  asTurn(turnId: string, edit: () => void): void;
  endTurn(): void;
  /** An edit that is a step of its own (load, revert, restore). */
  asStep(edit: () => void): void;
  destroy(): void;
}

/** Ctrl+Z for one space: the user's typing and what programs did for
 *  them, in time order. Lives as long as the space is loaded. */
export function createUndo(
  text: Y.Text,
  /** A new step began with the change that was just applied. */
  onStep: () => void = () => {},
): SpaceUndo {
  const manager = new Y.UndoManager(text, {
    trackedOrigins: new Set<unknown>([
      ORIGIN.user,
      ORIGIN.assistant,
      ORIGIN.load,
      ORIGIN.neutral,
    ]),
    captureTimeout: 500,
  });
  // The turn whose step is on top of the stack, while nothing else was
  // done since: the next edit of that turn joins it.
  let open: string | null = null;
  const changes = (tr: Y.Transaction): ReadonlyMap<unknown, unknown> =>
    tr.changed;
  const onTransaction = (tr: Y.Transaction) => {
    if (tr.origin === ORIGIN.assistant || !changes(tr).has(text)) return;
    if (tr.origin === manager || manager.trackedOrigins.has(tr.origin))
      open = null;
  };
  text.doc?.on("afterTransaction", onTransaction);
  manager.on("stack-item-added", ({ origin }) => {
    if (origin !== manager) onStep();
  });

  return {
    undo: () => manager.undo() !== null,
    redo: () => manager.redo() !== null,
    asTurn(turnId, edit) {
      const timeout = manager.captureTimeout;
      if (open === turnId) manager.captureTimeout = Number.POSITIVE_INFINITY;
      else manager.stopCapturing();
      try {
        edit();
      } finally {
        manager.captureTimeout = timeout;
      }
      open = turnId;
    },
    endTurn() {
      manager.stopCapturing();
      open = null;
    },
    asStep(edit) {
      manager.stopCapturing();
      edit();
      manager.stopCapturing();
      open = null;
    },
    destroy() {
      text.doc?.off("afterTransaction", onTransaction);
      manager.destroy();
    },
  };
}
