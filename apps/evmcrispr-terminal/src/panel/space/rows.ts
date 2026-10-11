import {
  type ClearedEntry,
  lineStats,
  type Markers,
  orderedEntries,
  type RevisionEntry,
  type RunEntry,
  revisionsSinceApproved,
  type TimelineEntry,
  type TimelineState,
} from "@evmcrispr/space";

export type Filter = "all" | "revisions" | "runs";
/** How many entries the timeline renders before "Show earlier". */
export const WINDOW = 200;

export interface RevisionRow {
  kind: "revision";
  entry: RevisionEntry;
  added: number;
  removed: number;
  /** Recorded since the script last matched the approved text. A mark for
   *  the reader: it decides nothing. */
  unreviewed: boolean;
  shared: boolean;
  /** The revision before it, while its text is still kept. */
  parent?: RevisionEntry;
}

export type Row =
  | RevisionRow
  /** Consecutive revisions by the user with nothing between them. */
  | { kind: "revisions"; rows: RevisionRow[] }
  | { kind: "run"; entry: RunEntry; expanded: boolean }
  | { kind: "cleared"; entry: ClearedEntry };

type Shown = RevisionEntry | RunEntry | ClearedEntry;

const KINDS: Record<Filter, readonly TimelineEntry["kind"][]> = {
  all: ["revision", "run", "cleared"],
  revisions: ["revision"],
  runs: ["run"],
};

const isTyping = (row: Row): row is RevisionRow =>
  row.kind === "revision" &&
  row.entry.source === "user" &&
  row.entry.author.kind === "user";

/** The timeline as the rows to draw: what the filter keeps, the latest
 *  `shown` of it, and how many entries lie before. */
export function timelineRows(
  state: TimelineState,
  markers: Markers,
  options: {
    filter: Filter;
    shown: number;
    /** Whether the script is the approved text right now. */
    reviewed: boolean;
  },
): { rows: Row[]; earlier: number } {
  const kept = orderedEntries(state).filter((entry): entry is Shown =>
    KINDS[options.filter].includes(entry.kind),
  );
  const visible = kept.filter(
    (entry) => entry.ts >= (markers.hiddenBefore ?? Number.NEGATIVE_INFINITY),
  );
  const window = visible.slice(-options.shown);
  const pending = new Set(
    options.reviewed
      ? []
      : revisionsSinceApproved(state, markers.approvedText).map((r) => r.id),
  );
  const shared = new Set(
    [...state.entries.values()].flatMap((entry) =>
      entry.kind === "share" ? [entry.revisionId] : [],
    ),
  );
  const lastRun = window.findLast((entry) => entry.kind === "run");

  const rows = window.map((entry): Row => {
    if (entry.kind === "run")
      return { kind: "run", entry, expanded: entry === lastRun };
    if (entry.kind === "cleared") return { kind: "cleared", entry };
    const before = entry.parent ? state.entries.get(entry.parent) : undefined;
    const parent = before?.kind === "revision" ? before : undefined;
    return {
      kind: "revision",
      entry,
      ...lineStats(parent?.text ?? "", entry.text),
      unreviewed: pending.has(entry.id),
      shared: shared.has(entry.id),
      parent,
    };
  });

  // Adjacent revisions of the user's typing become one row.
  const grouped: Row[] = [];
  for (const row of rows) {
    const last = grouped.at(-1);
    if (!isTyping(row)) grouped.push(row);
    else if (last?.kind === "revisions") last.rows.push(row);
    else if (last && isTyping(last))
      grouped[grouped.length - 1] = { kind: "revisions", rows: [last, row] };
    else grouped.push(row);
  }
  return { rows: grouped, earlier: kept.length - window.length };
}
