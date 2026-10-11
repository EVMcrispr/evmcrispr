import { useMemo } from "react";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { useTimeline } from "../../app/SpaceContext";
import { isUnfinished, type Run } from "../../runs/run-manager";
import { RunControls, runLabel, STATUS } from "./RunCard";

/** The runs of this space that are not over, always in sight above the
 *  entries, whichever tab runs them. A row leads to its card; a paused
 *  run is resumed there, next to what it holds. */
export function PinnedRuns() {
  const { runs } = useApp();
  const live = useStore(runs.store);
  const stored = useTimeline((timeline) => timeline.runs);
  const unfinished = useMemo(
    () =>
      [...(stored as ReadonlyMap<string, Run>).values()]
        .map((record) => live[record.id]?.record ?? record)
        .filter(isUnfinished)
        .sort((a, b) => a.startedAt - b.startedAt),
    [stored, live],
  );
  if (unfinished.length === 0) return null;
  return (
    <ul
      aria-label="Unfinished runs"
      className="flex shrink-0 flex-col gap-1 px-2 pb-2"
    >
      {unfinished.map((record) => (
        <li
          key={record.id}
          className="flex items-center gap-2 border border-primary/35 bg-primary/5 px-2 py-1"
        >
          <button
            type="button"
            className="min-w-0 flex-1 cursor-pointer truncate text-left font-sans text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() =>
              document
                .getElementById(`run-${record.id}`)
                ?.scrollIntoView({ block: "nearest" })
            }
          >
            <span className="font-semibold">{runLabel(record)}</span>{" "}
            <span className="text-foreground/65">{STATUS[record.status]}</span>
            {record.status === "paused" && (
              <span className="text-primary"> · see what it holds</span>
            )}
          </button>
          <RunControls record={record} mine={!!live[record.id]} />
        </li>
      ))}
    </ul>
  );
}
