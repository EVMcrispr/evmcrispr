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
}

export const emptyTimeline: TimelineState = {
  entries: new Map(),
  runs: new Map(),
  removals: new Map(),
};

export function isEmptyPatch(patch: TimelinePatch): boolean {
  return (
    !patch.entries?.length && !patch.runs?.length && !patch.removals?.length
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
 * entries are a union by id and are never rewritten (a revision that is
 * not what its id says is dropped); of two run records
 * the greater `updatedAt` wins; removals are a union, and a removed entry
 * loses its content (a removed run entry takes its record with it).
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
  };

  for (const removal of patch.removals ?? []) {
    if (removals.has(removal.entryId)) continue;
    removals.set(removal.entryId, removal);
    entries.delete(removal.entryId);
    runs.delete(removal.entryId);
    changed.removals.push(removal);
  }
  for (const entry of patch.entries ?? []) {
    if (removals.has(entry.id) || entries.has(entry.id)) continue;
    if (!isGenuine(entry)) continue;
    entries.set(entry.id, entry);
    changed.entries.push(entry);
  }
  for (const run of patch.runs ?? []) {
    if (removals.has(run.id)) continue;
    const mine = runs.get(run.id);
    if (mine && mine.updatedAt >= run.updatedAt) continue;
    runs.set(run.id, run);
    changed.runs.push(run);
  }

  return {
    state: isEmptyPatch(changed) ? state : { entries, runs, removals },
    changed,
  };
}

export function toPatch(state: TimelineState): Required<TimelinePatch> {
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
