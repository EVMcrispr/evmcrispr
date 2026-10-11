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

/** The latest revision recorded here: the one nothing else names as
 *  parent, newest first when two tabs raced. Unverified revisions (what an
 *  export brought) are history to look at, never the state this copy
 *  records on top of: a link cannot place itself at the head of the chain,
 *  or stand in for the revision of a text the user arrives at. */
export function head(state: TimelineState): RevisionEntry | undefined {
  const all = revisions(state).filter((r) => !r.unverified);
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
  // A link made here: an entry from outside claiming one is not it.
  return shares(state).find(
    (share) => !share.unverified && share.revisionId === revisionId,
  );
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

/** Removals that bring a space back to its latest `MAX_REVISIONS`
 *  recorded here. Spared: revisions a run made here points at, and shared
 *  ones. What an export brought takes no part: it is not counted (it has
 *  its own allowance, enforced when it arrives: `mergeable`), not removed,
 *  and its runs and times spare or displace nothing. */
export function pruneRevisions(
  state: TimelineState,
  by: Author,
  ts: number,
): Removal[] {
  const all = revisions(state).filter((r) => !r.unverified);
  const excess = all.length - MAX_REVISIONS;
  if (excess <= 0) return [];
  const pinned = new Set([
    ...[...state.runs.values()]
      .filter((run) => !run.unverified)
      .map((run) => run.revisionId),
    ...shares(state)
      .filter((share) => !share.unverified)
      .map((share) => share.revisionId),
  ]);
  return all
    .slice(0, excess)
    .filter((r) => !pinned.has(r.id))
    .map((r) => ({ entryId: r.id, by, ts }));
}
