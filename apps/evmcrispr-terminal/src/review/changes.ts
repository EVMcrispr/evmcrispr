// What a review puts in front of the user, worked out from one text. The
// diff is against the approved text and nothing else; the revisions are
// context beside it and decide nothing.
import {
  type DiffLine,
  isReviewed,
  lineDiff,
  lineStats,
  type RevisionEntry,
  revisionsSinceApproved,
  type TimelineState,
} from "@evmcrispr/space";

export interface RecordedChange {
  entry: RevisionEntry;
  /** The revision before it, while its text is still kept. */
  parent?: RevisionEntry;
  added: number;
  removed: number;
}

export interface Changes {
  /** The script this was worked out from. Everything a review shows, and
   *  what Approve approves, is about this text. */
  text: string;
  unreviewed: boolean;
  /** No text of this space was ever approved: all of it is new. */
  nothingApproved: boolean;
  /** `text` against the approved text; all of it added when nothing is
   *  approved. */
  diff: DiffLine[];
  /** For context: the revisions recorded since the script last matched
   *  the approved text, oldest first. */
  revisions: RecordedChange[];
}

export function changesOf(
  text: string,
  approvedText: string | undefined,
  timeline: TimelineState,
): Changes {
  const unreviewed = !isReviewed(text, approvedText);
  return {
    text,
    unreviewed,
    nothingApproved: approvedText === undefined,
    diff:
      approvedText === undefined
        ? text.split("\n").map((line) => ({ kind: "added", text: line }))
        : lineDiff(approvedText, text),
    revisions: unreviewed
      ? revisionsSinceApproved(timeline, approvedText).map((entry) => {
          const before = entry.parent
            ? timeline.entries.get(entry.parent)
            : undefined;
          const parent = before?.kind === "revision" ? before : undefined;
          return {
            entry,
            parent,
            ...lineStats(parent?.text ?? "", entry.text),
          };
        })
      : [],
  };
}
