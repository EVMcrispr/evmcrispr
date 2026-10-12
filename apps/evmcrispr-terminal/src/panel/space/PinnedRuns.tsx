import { Row } from "@repo/ui";
import { useMemo } from "react";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { useTimeline } from "../../app/SpaceContext";
import { isUnfinished, type Run } from "../../runs/run-manager";
import { RunControls, runLabel, StatusBadge } from "./RunCard";

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
      className="m-0 flex shrink-0 list-none flex-col gap-2 px-2.5 pb-2.5"
    >
      {unfinished.map((record) => (
        <Row
          key={record.id}
          as="li"
          title={
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="font-bold text-fg">{runLabel(record)}</span>{" "}
              <StatusBadge record={record} />
            </span>
          }
          meta={record.status === "paused" ? "See what it holds" : undefined}
          onClick={() =>
            document
              .getElementById(`run-${record.id}`)
              ?.scrollIntoView({ block: "nearest" })
          }
          actions={<RunControls record={record} mine={!!live[record.id]} />}
        />
      ))}
    </ul>
  );
}
