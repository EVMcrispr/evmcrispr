import { textHash } from "./hash";
import { revisions } from "./revisions";
import type { TimelineState } from "./timeline";
import type { RevisionEntry } from "./types";

/** A script is reviewed exactly when it is the text the user approved.
 *  Nothing a timeline entry says about itself takes part in this. */
export function isReviewed(
  text: string,
  approvedText: string | undefined,
): boolean {
  return approvedText !== undefined && text === approvedText;
}

/** Who a change to the script is by, as the host observed applying it:
 *  - `own`: the user's own writing (typing);
 *  - `foreign`: written by anyone else (an assistant turn, another copy);
 *  - `neutral`: nobody's writing, a move between states (undo, redo, a
 *    replaced content, a recorded text loaded or restored). */
export type ChangeKind = "own" | "foreign" | "neutral";

/**
 * The approved text after a change from `before` to `after`: the whole
 * rule of the review marker. The script is reviewed when it equals what
 * this returns.
 *
 * - An own change to a reviewed script takes the marker along.
 * - A neutral change to a reviewed script takes it along only onto a text
 *   that was approved before (`seen`): undo and redo within approved
 *   states. A step of the user's own can bring back what a program wrote,
 *   so whose step it was is never asked.
 * - Everything else leaves the marker where it is, so the script is
 *   reviewed after it only if it lands exactly on the approved text. In
 *   particular an unreviewed script never becomes reviewed through `seen`:
 *   an old approval is not reused to bless what someone else changed.
 *
 * The host adds a text to `seen` when it becomes the approved text.
 */
export function approvedAfter(
  approvedText: string | undefined,
  seen: Pick<ApprovedTexts, "has">,
  before: string,
  after: string,
  kind: ChangeKind,
): string | undefined {
  if (!isReviewed(before, approvedText)) return approvedText;
  if (kind === "own") return after;
  if (kind === "neutral" && seen.has(after)) return after;
  return approvedText;
}

export interface ApprovedTexts {
  add(text: string): void;
  has(text: string): boolean;
}

/** The texts that have been the approved text while a space is loaded,
 *  kept as hashes, the oldest forgotten past `limit`. */
export function approvedTexts(limit = 300): ApprovedTexts {
  const seen = new Set<string>();
  return {
    add(text) {
      const hash = textHash(text);
      seen.delete(hash);
      seen.add(hash);
      if (seen.size > limit) seen.delete(seen.values().next().value as string);
    },
    has: (text) => seen.has(textHash(text)),
  };
}

/** For display in a review, never for the decision: the revisions
 *  recorded since the script last matched the approved text. */
export function revisionsSinceApproved(
  state: TimelineState,
  approvedText: string | undefined,
): RevisionEntry[] {
  const all = revisions(state);
  // Counted from a revision recorded here: one an export brought, with
  // whatever text and time it likes, does not move the starting point.
  return all.slice(
    all.findLastIndex((r) => !r.unverified && r.text === approvedText) + 1,
  );
}
