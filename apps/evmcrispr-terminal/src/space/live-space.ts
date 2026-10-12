// The loaded space, and the one place that decides whether its script is
// reviewed. The rule (`approvedAfter` in @evmcrispr/space) needs to know
// what each change to the script is, and that is settled here, never read
// from a record and never guessed by the editor:
//  - foreign: content written by anyone but the user. It enters only
//    through this file, in three places: an assistant turn (`editAsTurn`),
//    what a transport delivers (`receive`), and a copy of the space from
//    outside this browser merged into it (`mergeCopy`: an export opened
//    where the space already is, whose script replaces the one here).
//    Reviewed after it only if the text is exactly the approved text.
//  - neutral: undo, redo, the editor's content being replaced, and
//    `load` (an entry loaded, a change reverted, a revision restored: the
//    text comes from a record, whoever wrote it). Nobody wrote anything;
//    reviewed after it only on a text approved before.
//  - own: everything else, which is the user's typing in the editor.
//    Applied to an approved text, it takes the approved text along.
// Nothing that handles foreign content can reach the editor (a test
// derives that from the import graph), so it cannot pass for typing.
import {
  type Author,
  applyText,
  approvedAfter,
  approvedTexts,
  type ChangeKind,
  type CheckedTimeline,
  displayTitle,
  type EditResult,
  emptyTimeline,
  head,
  initSpaceDoc,
  isEmptyPatch,
  isReviewed,
  type Markers,
  mergeable,
  mergeTimeline,
  nextRevision,
  pruneRevisions,
  type RevisionEntry,
  type RevisionInit,
  type SpaceMessage,
  type SpaceTransport,
  scriptText,
  strReplace,
  type TimelinePatch,
  type TimelineState,
} from "@evmcrispr/space";
import * as Y from "yjs";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Changes } from "../storage/changes";
import type { Storage } from "../storage/index";
import { changeKind, createUndo, ORIGIN, type SpaceUndo } from "./undo";

export interface SpaceDeps {
  storage: Storage;
  transport: SpaceTransport;
  changes: Changes;
  now(): number;
  /** The person at this browser, as an author. */
  me(): Author;
}

/** What a new space starts with. A space the user makes, migrates or
 *  opens from a link or an export starts approved. */
export interface SpaceInit {
  text: string;
  /** The one way to start with nothing approved: for a space made of
   *  text from inside the app that is not approved where it comes from
   *  (see `derive.ts`). The space is then unreviewed until a review. */
  unreviewed?: true;
  source: "user" | "import";
  origin?: { cid: string };
  /** Time of the first revision (migration keeps the old `updatedAt`). */
  ts?: number;
  createdAt?: number;
}

/** A copy of a space that arrived from outside this browser, checked:
 *  what `readExport` makes of an export. Its timeline has been through
 *  `parseTimeline`. Its script is text and nothing more: no document
 *  state crosses over, so nothing of it can be aimed at this document's
 *  history. */
export interface SpaceCopy {
  script: string;
  timeline: CheckedTimeline;
  /** The link it came from. */
  cid?: string;
}

/** What a program acting for the user may do to the script. It hands the
 *  edit over as data: only the space writes the document. */
export type ScriptEdit =
  | { kind: "replace"; oldString: string; newString: string }
  | { kind: "write"; text: string };

const INDEX_DELAY = 1000;

/** One loaded space: its document, its timeline and the one way to write
 *  to either. Every tab, the assistant and the run manager go through it. */
export interface LiveSpace {
  readonly id: string;
  readonly text: Y.Text;
  readonly undo: SpaceUndo;
  readonly timeline: StoreApi<TimelineState>;
  readonly markers: StoreApi<Markers>;
  getText(): string;
  /** Whether `text` is the approved script, or was while this space has
   *  been loaded in this page. Never answered from a timeline entry. */
  wasApproved(text: string): boolean;
  /** A local change to the timeline: memory, storage and the other copies. */
  commit(patch: TimelinePatch): void;
  /** The user's review, and the only way a text is approved from outside
   *  this file: `shown` becomes the approved text if it is the script
   *  right now, and is refused (false) otherwise. Whoever asks hands over
   *  the text the user was shown, so a script that changed since is never
   *  approved unseen. Typing not yet recorded becomes a revision first. */
  approve(shown: string): boolean;
  /** The user's other private marks. The approved text is not among
   *  them: it moves through `approve` and through this file's own rule. */
  setMarkers(
    patch: Partial<Pick<Markers, "hiddenBefore" | "revisionChats">>,
  ): Promise<void>;
  /** Records a revision if the script differs from the last one. */
  record(
    source: RevisionEntry["source"],
    extra?: Partial<Omit<RevisionInit, "source">>,
  ): RevisionEntry | null;
  /** An edit by a program acting for the user. Before a turn's first edit
   *  any unrecorded typing is recorded as the user's. */
  editAsTurn(turnId: string, edit: ScriptEdit): EditResult;
  /** Ends a turn: records its revision if it changed the script. */
  endTurn(turnId: string, summary?: string): RevisionEntry | null;
  /** Replaces the script without losing work: pending typing is recorded,
   *  then the text is replaced, then a revision of it is recorded. */
  load(
    text: string,
    source: "load" | "revert",
    from?: string,
  ): RevisionEntry | null;
  /** Merges a copy of this space from outside this browser into it. Its
   *  timeline only adds (`mergeable`). Its script, when it differs,
   *  replaces the one here as one change, declared foreign: the approved
   *  text does not move, so the script is then unreviewed, the review
   *  shows the difference, and the change is one revision that Restore to
   *  before takes back. Typing not yet recorded becomes the user's
   *  revision first. An equal script changes nothing. */
  mergeCopy(copy: SpaceCopy): void;
  /** Lets go of the undo histories of this script, in every tab of this
   *  browser: the space's own (Ctrl+Z), and through `onHistoryCleared`
   *  the editor model's. Neither can bring deleted text back afterwards.
   *  (The stored log of edits is not rewritten here: see where the space
   *  is opened.) */
  forgetHistory(): void;
  /** Told when the undo history was let go of, in this tab or another:
   *  whoever keeps an undo history of its own for this script (the
   *  editor's model does) lets go of it too. */
  onHistoryCleared(listener: () => void): () => void;
  close(): Promise<void>;
}

export async function openLiveSpace(
  id: string,
  deps: SpaceDeps,
  init?: SpaceInit | { copy: SpaceCopy },
): Promise<LiveSpace> {
  const { storage, changes, now, me } = deps;
  const doc = new Y.Doc();
  const text = scriptText(doc);
  const timeline = createStore<TimelineState>(() => emptyTimeline);
  const markers = createStore<Markers>(() => ({}));

  // Once closed (released, or removed) nothing is written any more: a
  // late writer must not bring back the records of a deleted space.
  let closed = false;
  const merge = (patch: TimelinePatch, local: boolean) => {
    if (closed) return;
    const { state, changed } = mergeTimeline(timeline.getState(), patch);
    if (isEmptyPatch(changed)) return;
    timeline.setState(state, true);
    // A private mark that points at a revision that is gone goes with it
    // (the tab that removed it writes the marks; the others re-read).
    if (local && changed.removals.length + changed.forget.length > 0)
      dropChatsOfRemoved(state);
    void storage.records.mergeTimeline(id, changed);
    if (local) link.send({ kind: "timeline", patch: changed });
    syncIndex();
  };

  // Joined before loading: what other tabs send meanwhile is kept and
  // applied once storage has been read, so nothing falls in between.
  let loaded = false;
  const early: SpaceMessage[] = [];
  const receive = (message: SpaceMessage) => {
    if (!loaded) early.push(message);
    else if (message.kind === "doc")
      Y.applyUpdate(doc, message.update, ORIGIN.remote);
    else merge(message.patch, false);
  };
  const link = deps.transport.join(id, receive);

  const persistence = await storage.persistDoc(id, doc);
  timeline.setState(
    mergeTimeline(emptyTimeline, await storage.records.loadTimeline(id)).state,
    true,
  );
  markers.setState(await storage.records.getMarkers(id), true);

  // The approved texts an undo or a redo can land on while this space is
  // loaded: one per step of the undo history, not one per keystroke, so
  // that a long stretch of typing does not push its own start out. A text
  // enters when it is approved outright, and when the marker leaves it at
  // the start of a step or through an undo or redo.
  const seen = approvedTexts();
  // What this tab is still writing is newer than what storage holds: a
  // read of storage replaces the marks in memory only if nothing was
  // written here since the read began, and is made again otherwise.
  let moved = 0;
  let writing = 0;
  let stale = false;
  const reread = async () => {
    if (writing > 0) {
      stale = true;
      return;
    }
    const at = moved;
    const stored = await storage.records.getMarkers(id);
    if (closed) return;
    if (writing > 0) stale = true;
    else if (at !== moved) void reread();
    else {
      markers.setState(stored, true);
      caughtUp();
    }
  };
  // Set below, once the script is being watched.
  let caughtUp = () => {};
  const setMarkers = async (patch: Partial<Markers>) => {
    if (closed) return;
    markers.setState({ ...markers.getState(), ...patch }, true);
    syncIndex();
    moved++;
    writing++;
    try {
      await storage.records.patchMarkers(id, patch);
    } finally {
      writing--;
    }
    changes.announce({ store: "markers", key: id });
    if (writing === 0 && stale) {
      stale = false;
      void reread();
    }
  };

  /** An approval made outright: a new space, or the user's review. */
  const approve = (approvedText: string) => {
    seen.add(approvedText);
    return setMarkers({ approvedText });
  };

  const dropChatsOfRemoved = (state: TimelineState) => {
    const chats = markers.getState().revisionChats;
    if (!chats) return;
    const kept = Object.entries(chats).filter(([revision]) =>
      state.entries.has(revision),
    );
    if (kept.length < Object.keys(chats).length)
      void setMarkers({ revisionChats: Object.fromEntries(kept) });
  };

  // The list of spaces shows these without opening the space.
  let indexTimer: ReturnType<typeof setTimeout> | undefined;
  let touched = false;
  const writeIndex = () => {
    indexTimer = undefined;
    const patch = {
      title: displayTitle(text.toString()),
      unreviewed: !isReviewed(text.toString(), markers.getState().approvedText),
      ...(touched ? { updatedAt: now() } : {}),
    };
    touched = false;
    void storage.records
      .patchSpace(id, patch)
      .then(() => changes.announce({ store: "spaces", key: id }));
  };
  const syncIndex = () => {
    indexTimer ??= setTimeout(writeIndex, INDEX_DELAY);
  };

  // The only place a revision is made, and where the cap is applied.
  const record: LiveSpace["record"] = (source, extra = {}) => {
    if (closed) return null;
    // What a program wrote is never recorded as the user's, whoever asks
    // for the record: a turn that was cut short, a run started in the
    // middle of one, another tab. The mark is this browser's own.
    const pending = markers.getState().turnPending === true;
    if (pending) void setMarkers({ turnPending: false });
    if (pending && source === "user") source = "assistant";
    const entry = nextRevision(timeline.getState(), text.toString(), {
      source,
      author: source === "assistant" ? { kind: "assistant" } : me(),
      ts: now(),
      ...extra,
    });
    if (!entry) return null;
    merge({ entries: [entry] }, true);
    // A revision that was removed is not recorded again.
    if (!timeline.getState().entries.has(entry.id)) return null;
    const removals = pruneRevisions(timeline.getState(), me(), now());
    if (removals.length) merge({ removals }, true);
    return entry;
  };

  // A new space: its text, its first revision, and its text approved.
  // Each step is skipped when already made, so a creation that was
  // interrupted is completed by making the space again.
  const origin = (copy: SpaceCopy) =>
    copy.cid ? { origin: { cid: copy.cid } } : {};
  if (init && "copy" in init) {
    // A space this browser did not have, as an export holds it: its
    // script, and what `mergeable` lets through of its timeline, the same
    // rule as a merge into a space that is here. Everything it brings is
    // marked as from an export; the chain recorded here starts with one
    // revision of the script as it arrived. It starts approved like every
    // space that arrives, on one condition: the script here is the script
    // the user was told of. Anything else on arrival (a document left
    // under that id) is left for a review.
    const { copy } = init;
    initSpaceDoc(doc, { text: copy.script, createdAt: now() }, "init");
    merge(mergeable(timeline.getState(), copy.timeline), true);
    record("import", origin(copy));
    if (text.toString() === copy.script) await approve(copy.script);
    else syncIndex();
  } else if (init) {
    initSpaceDoc(
      doc,
      { text: init.text, createdAt: init.createdAt ?? now() },
      "init",
    );
    if (!head(timeline.getState())) {
      record(init.source, {
        ts: init.ts ?? now(),
        ...(init.origin ? { origin: init.origin } : {}),
      });
      if (!init.unreviewed) await approve(text.toString());
      else syncIndex();
    }
  }

  // A step of the undo history began with the change being applied. The
  // history hears of a change before the observer below does (it was
  // listening first), so the observer finds this already set.
  let stepBegan = false;
  const history = createUndo(text, () => {
    stepBegan = true;
  });

  const turns = new Set<string>();

  // The review marker: see the top of this file. Every change to the
  // script is seen here as it is applied, with what it is.
  const settle = (
    before: string,
    after: string,
    kind: ChangeKind,
    landing: boolean,
  ) => {
    const approved = markers.getState().approvedText;
    const next = approvedAfter(approved, seen, before, after, kind);
    if (next === approved || next === undefined) return syncIndex();
    // The marker leaves a text that was approved, whoever made it so
    // (storage at load, another tab). It is remembered when an undo or a
    // redo can come back to it.
    if (landing && approved !== undefined) seen.add(approved);
    void setMarkers({ approvedText: next });
  };
  let known = text.toString();
  // The text as it was after the last change that was not the user's own
  // typing: everything since is theirs.
  let ownSince = known;
  // Another tab of the user approved a text, and this tab hears of it
  // late, after the user typed on that very text here: the typing was on
  // an approved text all along, so it takes the approved text along now.
  caughtUp = () => {
    const approved = markers.getState().approvedText;
    if (approved === undefined || approved !== ownSince || known === ownSince)
      return;
    seen.add(approved);
    void setMarkers({ approvedText: known });
  };
  doc.on("afterTransaction", (transaction: Y.Transaction) => {
    const began = stepBegan;
    stepBegan = false;
    const before = known;
    known = text.toString();
    if (known === before) return;
    const kind = changeKind(transaction.origin);
    if (kind !== "own") ownSince = known;
    settle(before, known, kind, began || kind === "neutral");
  });
  // An undo or a redo writes nothing new: it is neutral, whoever made the
  // step it applies. (Its transaction was seen above as not the user's.)
  const replay = (step: () => boolean) => () => {
    const before = text.toString();
    const changed = step();
    if (changed) settle(before, text.toString(), "neutral", true);
    return changed;
  };
  const undo: SpaceUndo = {
    ...history,
    undo: replay(history.undo),
    redo: replay(history.redo),
  };

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === ORIGIN.remote || origin === "storage") return;
    link.send({ kind: "doc", update });
    touched = true;
    syncIndex();
  });
  const cleared = new Set<() => void>();
  /** Lets go of every undo history of this script in this tab. */
  const forget = () => {
    undo.clear();
    for (const listener of [...cleared]) listener();
  };
  // Another tab moved a marker: it is re-read, never worked out here.
  const stopChanges = changes.subscribe(async (change, local) => {
    if (!local && change.store === "history" && change.key === id) forget();
    if (!local && change.store === "markers" && change.key === id)
      await reread();
  });

  loaded = true;
  for (const message of early.splice(0)) receive(message);
  // What is stored is rewritten as the document as it was just read:
  // text typed and deleted in an earlier visit goes from the stored log.
  void persistence.compact().catch(() => {});

  return {
    id,
    text,
    undo,
    timeline,
    markers,
    getText: () => text.toString(),
    wasApproved: (candidate) =>
      candidate === markers.getState().approvedText || seen.has(candidate),
    commit: (patch) => merge(patch, true),
    approve(shown) {
      // One synchronous step: the text compared is the text approved.
      if (closed || shown !== text.toString()) return false;
      record("user");
      void approve(shown);
      return true;
    },
    // Only the marks named are taken from the patch, whatever it holds.
    setMarkers: ({ hiddenBefore, revisionChats }) =>
      setMarkers({
        ...(hiddenBefore !== undefined ? { hiddenBefore } : {}),
        ...(revisionChats !== undefined ? { revisionChats } : {}),
      }),
    record,
    editAsTurn(turnId, edit) {
      // Whoever still has the object after it was let go, or its space
      // removed, changes nothing with it.
      if (closed)
        return { ok: false, error: "This space was closed or removed." };
      if (!turns.has(turnId)) {
        turns.add(turnId);
        record("user");
      }
      if (!markers.getState().turnPending)
        void setMarkers({ turnPending: true });
      let result: EditResult = { ok: true };
      history.asTurn(turnId, () => {
        if (edit.kind === "replace")
          result = strReplace(
            text,
            edit.oldString,
            edit.newString,
            ORIGIN.assistant,
          );
        else applyText(text, edit.text, ORIGIN.assistant);
      });
      return result;
    },
    endTurn(turnId, summary) {
      if (!turns.delete(turnId)) return null;
      undo.endTurn();
      return record("assistant", summary ? { summary } : {});
    },
    load(next, source, from) {
      if (next === text.toString() && head(timeline.getState())?.text === next)
        return null;
      record("user");
      undo.asStep(() => void applyText(text, next, ORIGIN.load));
      return record(source, from ? { from } : {});
    },
    mergeCopy(copy) {
      if (closed) return;
      record("user");
      merge(mergeable(timeline.getState(), copy.timeline), true);
      if (applyText(text, copy.script, ORIGIN.copy))
        record("merge", origin(copy));
    },
    forgetHistory() {
      if (closed) return;
      forget();
      // Every other tab that has the space loaded does the same.
      changes.announce({ store: "history", key: id });
    },
    onHistoryCleared(listener) {
      cleared.add(listener);
      return () => cleared.delete(listener);
    },
    async close() {
      closed = true;
      if (indexTimer !== undefined) {
        clearTimeout(indexTimer);
        writeIndex();
      }
      stopChanges();
      link.leave();
      undo.destroy();
      await persistence.stop();
      doc.destroy();
    },
  };
}
