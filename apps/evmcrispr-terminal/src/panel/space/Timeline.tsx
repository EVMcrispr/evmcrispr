import { isReviewed } from "@evmcrispr/space";
import { cn } from "@repo/ui";
import { useMemo, useState } from "react";
import {
  useMarkers,
  useScript,
  useSpace,
  useTimeline,
} from "../../app/SpaceContext";
import { useStickToBottom } from "../agents/useStickToBottom";
import { PinnedRuns } from "./PinnedRuns";
import { RevisionGroup, RevisionRow } from "./RevisionRow";
import { RunCard } from "./RunCard";
import { type Filter, timelineRows, WINDOW } from "./rows";
import { StdinRow } from "./StdinRow";
import { TimelineHeader } from "./TimelineHeader";
import { clock } from "./time";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "revisions", label: "Revisions" },
  { value: "runs", label: "Runs" },
];

/** The timeline of the space on screen: what was recorded of its script
 *  and every run of it, oldest first. */
export function Timeline() {
  const space = useSpace();
  return <TimelineOf key={space.id} />;
}

function TimelineOf() {
  const state = useTimeline((timeline) => timeline);
  const markers = useMarkers();
  const { text } = useScript();
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(WINDOW);
  const reviewed = isReviewed(text, markers.approvedText);
  const { rows, earlier } = useMemo(
    () => timelineRows(state, markers, { filter, shown, reviewed }),
    [state, markers, filter, shown, reviewed],
  );
  const { listRef, onScroll } = useStickToBottom(rows, false);

  return (
    <div className="flex h-full flex-col">
      <TimelineHeader />
      <fieldset className="flex shrink-0 gap-1.5 px-2 py-2">
        <legend className="sr-only">Show</legend>
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            className={cn(
              "cursor-pointer rounded-full border px-2.5 py-0.5 font-sans text-xs outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              filter === value
                ? "border-primary text-primary"
                : "border-foreground/20 text-foreground/60 hover:text-foreground",
            )}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <PinnedRuns />
      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
        {earlier > 0 && (
          <button
            type="button"
            className="mb-1 w-full cursor-pointer py-1 text-center font-sans text-xs text-foreground/55 hover:text-foreground"
            onClick={() => setShown((n) => n + WINDOW)}
          >
            Show earlier ({earlier})
          </button>
        )}
        <ol aria-label="Timeline" className="flex flex-col gap-1.5">
          {rows.map((row) =>
            row.kind === "revision" ? (
              <li key={row.entry.id}>
                <RevisionRow row={row} />
              </li>
            ) : row.kind === "revisions" ? (
              <li key={row.rows[0].entry.id}>
                <RevisionGroup rows={row.rows} />
              </li>
            ) : row.kind === "run" ? (
              <li key={row.entry.id}>
                <RunCard runId={row.entry.runId} open={row.expanded} />
              </li>
            ) : (
              <li
                key={row.entry.id}
                className="px-2 py-1 font-sans text-xs text-foreground/45"
              >
                You cleared the timeline · {clock(row.entry.ts, Date.now())}
              </li>
            ),
          )}
          {rows.length === 0 && (
            <li className="px-2 py-4 font-sans text-sm text-foreground/45">
              Nothing here yet.
            </li>
          )}
        </ol>
      </div>
      <StdinRow />
    </div>
  );
}
