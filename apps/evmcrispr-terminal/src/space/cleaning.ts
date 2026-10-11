// Tidying a timeline. Each of these acts on a click of the user, behind a
// confirmation where it cannot be undone, and only on what it names: the
// timeline's records, or one private mark. None touches the script, the
// approved text, another space or a chat.
//
// What each action reaches is one table, `REACH`: every place that can
// retain text, against every action that removes something (removing the
// space is one of them: `Spaces.remove`). The dialogs say what an action
// leaves behind from the same table, and a test walks it cell by cell. A
// place is cleared by one function wherever it is cleared:
//   entries, runs, memory   `mergeTimeline`, through `LiveSpace.commit`
//                           (storage and every tab follow it)
//   views                   `stopLookingAtRemoved` (app/removed.ts)
//   undo, editorUndo        `LiveSpace.forgetHistory`
//   documentLog             rewritten whenever a space is opened
//                           (`openLiveSpace`), deleted with the space
//   chatMarks               `LiveSpace`, on every local removal
//   index, and all of the above for a space   `Spaces.remove`
import {
  type Author,
  head,
  orderedEntries,
  type Removal,
  type RevisionEntry,
  revisionId,
  type TimelineState,
  UNFINISHED,
} from "@evmcrispr/space";
import type { LiveSpace } from "./live-space";

/** Hides everything recorded before `now`, in this browser only. */
export const clearForMe = (space: LiveSpace, now: number) =>
  space.setMarkers({ hiddenBefore: now });

/** Brings back what Clear for me hid. */
export const showEarlier = (space: LiveSpace) =>
  space.setMarkers({ hiddenBefore: 0 });

/** A run made here that has not ended: it is not taken from under
 *  whoever runs it. A run an export brought never counts as one. */
const going = (state: TimelineState, id: string) => {
  const run = state.runs.get(id);
  return !!run && !run.unverified && UNFINISHED.includes(run.status);
};

/** The removal of one entry: who and when, and whether what goes is
 *  something an export brought (see `Removal.unverified`). */
const removalOf = (
  state: TimelineState,
  entryId: string,
  by: Author,
  ts: number,
): Removal => ({
  entryId,
  by,
  ts,
  ...(state.entries.get(entryId)?.unverified ? { unverified: true } : {}),
});

/** Removes one entry for good: its content is deleted, and a removal
 *  stays so that an older copy does not bring it back. */
export function removeEntry(
  space: LiveSpace,
  entryId: string,
  by: Author,
  now: number,
): void {
  const state = space.timeline.getState();
  if (!state.entries.has(entryId) || going(state, entryId)) return;
  space.commit({ removals: [removalOf(state, entryId, by, now)] });
}

/**
 * Removes every entry of the timeline for good, except:
 *  - runs made here that have not finished;
 *  - revisions shared from here, with their links: other people hold them;
 * and leaves in their place one fresh revision of the script as it is,
 * and an entry saying who cleared and when. Nothing an export brought is
 * kept as either exception, whatever it says of itself. The script and
 * its approval are untouched: the approved text is text, not a revision.
 * The undo history goes too, so Ctrl+Z cannot bring an earlier version
 * back.
 */
export function clearTimeline(space: LiveSpace, by: Author, now: number): void {
  // Typing not yet recorded is part of the script that is kept.
  space.record("user");
  const state = space.timeline.getState();
  const text = space.getText();
  const last = head(state);

  const shared = new Set(
    orderedEntries(state).flatMap((entry) =>
      entry.kind === "share" && !entry.unverified ? [entry.revisionId] : [],
    ),
  );
  const kept = (entry: ReturnType<typeof orderedEntries>[number]) =>
    !entry.unverified &&
    ((entry.kind === "revision" && shared.has(entry.id)) ||
      (entry.kind === "share" && state.entries.has(entry.revisionId)) ||
      (entry.kind === "run" && going(state, entry.id)));

  // The starting point from here on. It follows the clearing itself, not
  // a revision: its id is its own, whatever was removed before it.
  const cleared = crypto.randomUUID();
  const fresh: RevisionEntry = {
    kind: "revision",
    id: revisionId(text, cleared),
    parent: cleared,
    text,
    // Whoever the script as it stands was recorded as written by.
    source: last?.text === text ? last.source : "user",
    author: last?.text === text ? last.author : by,
    ts: now,
  };
  space.commit({
    removals: orderedEntries(state)
      .filter((entry) => !kept(entry))
      .map((entry) => removalOf(state, entry.id, by, now)),
    entries: [fresh, { kind: "cleared", id: cleared, ts: now, author: by }],
  });
  // The earlier versions are not kept in any undo history either.
  space.forgetHistory();
}

/** Drops everything exports brought into this space: every unverified
 *  entry and run. Nothing recorded here is touched, and no removal is
 *  left: opening a link again brings its records again. */
export function removeImported(space: LiveSpace): void {
  const state = space.timeline.getState();
  const forget = new Set<string>();
  for (const entry of state.entries.values())
    if (entry.unverified) forget.add(entry.id);
  for (const run of state.runs.values()) if (run.unverified) forget.add(run.id);
  if (forget.size) space.commit({ forget: [...forget] });
}

export type CleaningAction =
  | "remove"
  | "removeImported"
  | "clearTimeline"
  | "removeSpace";

/** A place of this browser that can retain text of a space. */
export type Place =
  /** The entries' records in storage. */
  | "entries"
  /** Run records in storage, with their consoles and output. */
  | "runs"
  /** The timeline in memory, in every tab. */
  | "memory"
  /** A revision being viewed, or a review listing it, in every tab. */
  | "views"
  /** The space's undo history (Ctrl+Z), in every tab. */
  | "undo"
  /** The editor model's own undo stack, in every tab. */
  | "editorUndo"
  /** The stored log of edits to the document. */
  | "documentLog"
  /** The private marks that point from a revision to its chat. */
  | "chatMarks"
  /** The space's row in the list of spaces. */
  | "index"
  /** The assistant's chats: never a space's. */
  | "chats";

/** `named`: cleared of what the action names. `all`: cleared whole.
 *  `kept`: the action does not reach it. */
export type Reach = "named" | "all" | "kept";

export const REACH: Record<CleaningAction, Record<Place, Reach>> = {
  // One entry: a revision, a run, or a note of a clearing.
  remove: {
    entries: "named",
    runs: "named",
    memory: "named",
    views: "named",
    undo: "kept",
    editorUndo: "kept",
    documentLog: "kept",
    chatMarks: "named",
    index: "kept",
    chats: "kept",
  },
  // Every unverified entry and run.
  removeImported: {
    entries: "named",
    runs: "named",
    memory: "named",
    views: "named",
    undo: "kept",
    editorUndo: "kept",
    documentLog: "kept",
    chatMarks: "named",
    index: "kept",
    chats: "kept",
  },
  // Everything but one fresh revision, unfinished runs, shared revisions.
  clearTimeline: {
    entries: "named",
    runs: "named",
    memory: "named",
    views: "named",
    undo: "all",
    editorUndo: "all",
    // The log is rewritten as the document's present state whenever a
    // space is opened, which drops what was deleted in earlier visits.
    // What was deleted since this page was loaded is still part of the
    // loaded document's history, and no rewrite from it would drop it.
    documentLog: "kept",
    chatMarks: "named",
    index: "kept",
    chats: "kept",
  },
  removeSpace: {
    entries: "all",
    runs: "all",
    memory: "all",
    views: "all",
    undo: "all",
    editorUndo: "all",
    documentLog: "all",
    chatMarks: "all",
    index: "all",
    chats: "kept",
  },
};

/** What is still there after an action that does not reach a place, in
 *  words for the dialog that asks before it. A place with no sentence
 *  needs none (the list keeping its row is no surprise). */
const LEFT: Partial<Record<Place, string>> = {
  undo: "Undo (Ctrl+Z) can still bring back text that was typed and deleted since this page was loaded.",
  documentLog:
    "Text typed and deleted in the script since this page was loaded stays in this browser's storage of the document until the space is opened again after a reload.",
  chats: "Chats in which the assistant read the script keep what they read.",
};

/** What `action` leaves behind, for the person about to confirm it. What
 *  left this browser is never reached, whatever the action. */
export function leftBehind(action: CleaningAction): string[] {
  const places = Object.keys(LEFT) as Place[];
  return [
    ...places
      .filter((place) => REACH[action][place] === "kept")
      .map((place) => LEFT[place] as string),
    "Exports and share links made earlier still contain what they contained, and cannot be recalled.",
  ];
}
