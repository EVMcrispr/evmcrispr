import {
  mergeTimeline,
  nextRevision,
  type RevisionEntry,
  type RevisionSource,
  type RunRecord,
  type TimelineEntry,
  type TimelineState,
} from "@evmcrispr/space";

/** The revision `text` would be on top of `state`. */
export function rev(
  state: TimelineState,
  text: string,
  source: RevisionSource,
  ts: number,
): RevisionEntry {
  const entry = nextRevision(state, text, {
    source,
    ts,
    author: source === "assistant" ? { kind: "assistant" } : { kind: "user" },
  });
  if (!entry) throw new Error(`"${text}" is already the latest revision`);
  return entry;
}

export const add = (
  state: TimelineState,
  ...entries: TimelineEntry[]
): TimelineState => mergeTimeline(state, { entries }).state;

/** A run entry with its record. */
export function run(
  state: TimelineState,
  id: string,
  ts: number,
  record: Partial<RunRecord> = {},
): TimelineState {
  return mergeTimeline(state, {
    entries: [{ kind: "run", id, runId: id, ts, author: { kind: "user" } }],
    runs: [
      {
        id,
        revisionId: "",
        mode: "real",
        status: "success",
        startedAt: ts,
        by: { kind: "user" },
        console: { slots: [], boxes: {}, live: 0 },
        errors: [],
        output: "",
        executedCount: 0,
        updatedAt: ts,
        ...record,
      },
    ],
  }).state;
}
