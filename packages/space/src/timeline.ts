import { revisionId } from "./hash";
import type { Removal, RunRecord, TimelineEntry } from "./types";

export interface TimelineState {
  entries: ReadonlyMap<string, TimelineEntry>;
  runs: ReadonlyMap<string, RunRecord>;
  removals: ReadonlyMap<string, Removal>;
}

/** Any subset of a timeline: what a tab, an export or (later) a member
 *  sends, and what `mergeTimeline` reports as changed. */
export interface TimelinePatch {
  entries?: TimelineEntry[];
  runs?: RunRecord[];
  removals?: Removal[];
  /** Ids of unverified entries and runs to drop with no removal left
   *  behind: what an export brought giving way to a newer import, or
   *  cleared out by the user. It can be taken in again. An id that names
   *  anything recorded here is ignored. */
  forget?: string[];
}

/** The records of a timeline, whole: what is stored and what is exported. */
export type TimelineRecords = Required<Omit<TimelinePatch, "forget">>;

export const emptyTimeline: TimelineState = {
  entries: new Map(),
  runs: new Map(),
  removals: new Map(),
};

export function isEmptyPatch(patch: TimelinePatch): boolean {
  return (
    !patch.entries?.length &&
    !patch.runs?.length &&
    !patch.removals?.length &&
    !patch.forget?.length
  );
}

/** The one check made on what is merged in: a revision's id has to be the
 *  hash of its own text and parent. */
function isGenuine(entry: TimelineEntry): boolean {
  return (
    entry.kind !== "revision" ||
    entry.id === revisionId(entry.text, entry.parent)
  );
}

/**
 * Merges `patch` into `state`. The same three rules everywhere:
 * entries are a union by id and are never rewritten, except an unverified
 * one by one recorded here (a revision that is not what its id says is
 * dropped); of two run records
 * the greater `updatedAt` wins (never between one recorded here and an
 * unverified one); removals are a union, and a removed entry loses its content (a
 * removed run entry takes its record with it), except that the removal
 * of an unverified entry removes unverified content only.
 *
 * `changed` is what actually differed, for persisting and relaying;
 * merging the same patch twice changes nothing.
 */
export function mergeTimeline(
  state: TimelineState,
  patch: TimelinePatch,
): { state: TimelineState; changed: Required<TimelinePatch> } {
  const entries = new Map(state.entries);
  const runs = new Map(state.runs);
  const removals = new Map(state.removals);
  const changed: Required<TimelinePatch> = {
    entries: [],
    runs: [],
    removals: [],
    forget: [],
  };

  for (const id of patch.forget ?? []) {
    const entry = entries.get(id)?.unverified;
    const run = runs.get(id)?.unverified;
    if (entry) entries.delete(id);
    if (run) runs.delete(id);
    if (entry || run) changed.forget.push(id);
  }

  for (const removal of patch.removals ?? []) {
    const known = removals.get(removal.entryId);
    // An ordinary removal takes the place of one of an unverified entry.
    if (known && !(known.unverified && !removal.unverified)) continue;
    removals.set(removal.entryId, removal);
    if (!removal.unverified || entries.get(removal.entryId)?.unverified)
      entries.delete(removal.entryId);
    if (!removal.unverified || runs.get(removal.entryId)?.unverified)
      runs.delete(removal.entryId);
    changed.removals.push(removal);
  }
  for (const entry of patch.entries ?? []) {
    // A removal of an unverified entry holds back unverified entries only.
    const removal = removals.get(entry.id);
    if (removal && !(removal.unverified && !entry.unverified)) continue;
    // The one case an entry is replaced: a revision recorded here takes
    // the place of an unverified one of the same id. A revision's id
    // covers only its text and parent, so an export can hold, ahead of
    // time, the revision the user will record; theirs is the one that
    // stands. Nothing else is ever replaced, and the mark is lost no
    // other way.
    const held = entries.get(entry.id);
    if (
      held &&
      !(held.kind === "revision" && held.unverified && !entry.unverified)
    )
      continue;
    if (!isGenuine(entry)) continue;
    entries.set(entry.id, entry);
    changed.entries.push(entry);
  }
  for (const run of patch.runs ?? []) {
    if (removals.has(run.id)) continue;
    const mine = runs.get(run.id);
    // A record made here and one an export brought never replace each
    // other, whatever time either gives; of two of a kind, the newer.
    if (mine && !mine.unverified !== !run.unverified) continue;
    if (mine && mine.updatedAt >= run.updatedAt) continue;
    runs.set(run.id, run);
    changed.runs.push(run);
  }

  return {
    state: isEmptyPatch(changed) ? state : { entries, runs, removals },
    changed,
  };
}

export function toPatch(state: TimelineState): TimelineRecords {
  return {
    entries: [...state.entries.values()],
    runs: [...state.runs.values()],
    removals: [...state.removals.values()],
  };
}

/** Entries oldest first; equal times fall back to id so order is stable
 *  across tabs. */
export function orderedEntries(state: TimelineState): TimelineEntry[] {
  return [...state.entries.values()].sort(
    (a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
