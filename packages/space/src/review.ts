import { revisions } from "./revisions";
import type { TimelineState } from "./timeline";
import type { RevisionEntry } from "./types";

/** Revisions after `approved`, oldest first. Everything when nothing is
 *  approved, or when the approved revision is no longer kept. */
function after(all: RevisionEntry[], approved: string | undefined) {
  const at = approved ? all.findIndex((r) => r.id === approved) : -1;
  return all.slice(at + 1);
}

/** Where the approved marker stands once it has followed the user's own
 *  revisions. The author decides, not the source: it moves through what
 *  the user wrote, loaded, reverted or imported, and stops at a revision
 *  made by anyone else. */
export function followApproved(
  state: TimelineState,
  approved: string | undefined,
): string | undefined {
  if (!approved) return undefined;
  let current = approved;
  for (const revision of after(revisions(state), approved)) {
    if (revision.author.kind !== "user" || revision.parent !== current) break;
    current = revision.id;
  }
  return current;
}

/** The revisions a review has to show: everything after the approved one
 *  (after it has followed the user's own). Empty means reviewed. */
export function unreviewedRevisions(
  state: TimelineState,
  approved: string | undefined,
): RevisionEntry[] {
  return after(revisions(state), followApproved(state, approved));
}
