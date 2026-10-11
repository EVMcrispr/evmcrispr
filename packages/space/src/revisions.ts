import { revisionId } from "./hash";
import { orderedEntries, type TimelineState } from "./timeline";
import type {
  Author,
  Removal,
  RevisionEntry,
  RevisionSource,
  ShareEntry,
} from "./types";

export const MAX_REVISIONS = 300;

export function revisions(state: TimelineState): RevisionEntry[] {
  return orderedEntries(state).filter(
    (entry): entry is RevisionEntry => entry.kind === "revision",
  );
}

/** The latest revision: the one nothing else names as parent, newest
 *  first when two tabs raced. */
export function head(state: TimelineState): RevisionEntry | undefined {
  const all = revisions(state);
  const parents = new Set(all.map((r) => r.parent));
  for (let i = all.length - 1; i >= 0; i--)
    if (!parents.has(all[i].id)) return all[i];
  return all.at(-1);
}

function shares(state: TimelineState): ShareEntry[] {
  return orderedEntries(state).filter(
    (entry): entry is ShareEntry => entry.kind === "share",
  );
}

/** The link a revision was first shared with, when it has been. */
export function shareOf(
  state: TimelineState,
  revisionId: string,
): ShareEntry | undefined {
  return shares(state).find((share) => share.revisionId === revisionId);
}

export interface RevisionInit {
  source: RevisionSource;
  author: Author;
  ts: number;
  summary?: string;
  origin?: { cid: string };
  from?: string;
}

/** The revision to record for `text`, or null when the script does not
 *  differ from the last one. */
export function nextRevision(
  state: TimelineState,
  text: string,
  init: RevisionInit,
): RevisionEntry | null {
  const last = head(state);
  if (last && last.text === text) return null;
  return {
    kind: "revision",
    id: revisionId(text, last?.id),
    text,
    ...(last ? { parent: last.id } : {}),
    ...init,
  };
}

/** Removals that bring a space back to its latest `MAX_REVISIONS`. Spared:
 *  revisions a run points at and shared ones. */
export function pruneRevisions(
  state: TimelineState,
  by: Author,
  ts: number,
): Removal[] {
  const all = revisions(state);
  const excess = all.length - MAX_REVISIONS;
  if (excess <= 0) return [];
  const pinned = new Set([
    ...[...state.runs.values()].map((run) => run.revisionId),
    ...shares(state).map((share) => share.revisionId),
  ]);
  return all
    .slice(0, excess)
    .filter((r) => !pinned.has(r.id))
    .map((r) => ({ entryId: r.id, by, ts }));
}
