// The loaded space, and the one place that decides whether its script is
// reviewed. The rule (`approvedAfter` in @evmcrispr/space) needs to know
// what each change to the script is, and that is settled here, never read
// from a record and never guessed by the editor:
//  - foreign: content written by anyone but the user. It enters only
//    through this file: an assistant turn (`editAsTurn`) and what a
//    transport delivers (`receive`). Reviewed after it only if the text is
//    exactly the approved text.
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
  displayTitle,
  type EditResult,
  emptyTimeline,
  head,
  initSpaceDoc,
  isEmptyPatch,
  isReviewed,
  type Markers,
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

/** What a new space starts with. However it arrived, it starts approved. */
export interface SpaceInit {
  text: string;
  source: "user" | "import";
  origin?: { cid: string };
  /** Time of the first revision (migration keeps the old `updatedAt`). */
  ts?: number;
  createdAt?: number;
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
  /** A local change to the timeline: memory, storage and the other copies. */
  commit(patch: TimelinePatch): void;
  setMarkers(patch: Partial<Markers>): Promise<void>;
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
  close(): Promise<void>;
}

export async function openLiveSpace(
  id: string,
  deps: SpaceDeps,
  init?: SpaceInit,
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
  const setMarkers = async (patch: Partial<Markers>) => {
    markers.setState({ ...markers.getState(), ...patch }, true);
    syncIndex();
    await storage.records.patchMarkers(id, patch);
    changes.announce({ store: "markers", key: id });
  };

  /** An approval made outright: a new space, or the user's review. */
  const approve = (patch: Partial<Markers>) => {
    if (patch.approvedText !== undefined) seen.add(patch.approvedText);
    return setMarkers(patch);
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
    const entry = nextRevision(timeline.getState(), text.toString(), {
      source,
      author: source === "assistant" ? { kind: "assistant" } : me(),
      ts: now(),
      ...extra,
    });
    if (!entry) return null;
    merge({ entries: [entry] }, true);
    const removals = pruneRevisions(timeline.getState(), me(), now());
    if (removals.length) merge({ removals }, true);
    return entry;
  };

  // A new space: its text, its first revision, and its text approved.
  // Each step is skipped when already made, so a creation that was
  // interrupted is completed by making the space again.
  if (init) {
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
      await approve({ approvedText: text.toString() });
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
  doc.on("afterTransaction", (transaction: Y.Transaction) => {
    const began = stepBegan;
    stepBegan = false;
    const before = known;
    known = text.toString();
    if (known === before) return;
    const kind = changeKind(transaction.origin);
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
  // Another tab moved a marker: it is re-read, never worked out here.
  const stopChanges = changes.subscribe(async (change, local) => {
    if (!local && change.store === "markers" && change.key === id)
      markers.setState(await storage.records.getMarkers(id), true);
  });

  loaded = true;
  for (const message of early.splice(0)) receive(message);

  return {
    id,
    text,
    undo,
    timeline,
    markers,
    getText: () => text.toString(),
    commit: (patch) => merge(patch, true),
    setMarkers: approve,
    record,
    editAsTurn(turnId, edit) {
      if (!turns.has(turnId)) {
        turns.add(turnId);
        record("user");
      }
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
