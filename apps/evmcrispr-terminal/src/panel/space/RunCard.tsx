import { Console, consoleEntries } from "@evmcrispr/editor";
import type { RunStatus } from "@evmcrispr/space";
import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { cn } from "@repo/ui";
import { useEffect, useState } from "react";
import { useApp } from "../../app/AppContext";
import { useTimeline } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import { isUnfinished, type Run } from "../../runs/run-manager";
import { useRunOf } from "../../runs/useRun";
import { downloadOutput } from "../../utils/download-output";
import { HeldRun } from "./HeldRun";
import { clock } from "./time";

export const STATUS: Record<RunStatus, string> = {
  running: "Running",
  paused: "Paused",
  watching: "Watching",
  success: "Done",
  error: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

const WHY = {
  left: "you opened another space",
  declined: "you declined in your wallet",
};

export const runLabel = (record: Run) =>
  record.mode === "simulated" ? "Simulation" : "Run";

const control =
  "cursor-pointer rounded-(--radius) border px-2 py-0.5 font-sans text-xs outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

/** Cancel, for a run this tab is running. A run of another tab can only
 *  be watched from here. Resume is not here: it lives with the held
 *  action it sends (`HeldRun`). */
export function RunControls({ record, mine }: { record: Run; mine: boolean }) {
  const { runs } = useApp();
  if (!isUnfinished(record)) return null;
  if (!mine)
    return (
      <span className="shrink-0 font-sans text-xs text-foreground/50">
        in another tab
      </span>
    );
  return (
    <button
      type="button"
      className={cn(
        control,
        "shrink-0 border-foreground/25 text-foreground/75",
      )}
      onClick={() => runs.cancel(record.id)}
    >
      {record.status === "watching" ? "Stop following" : "Cancel"}
    </button>
  );
}

/** One run of the space: what it is, how it stands, and its console. */
export function RunCard({
  runId,
  open: initially,
}: {
  runId: string;
  open: boolean;
}) {
  const run = useRunOf(runId);
  const [open, setOpen] = useState(initially);
  // The latest run opens by itself, and an earlier one closes when a
  // newer one takes its place.
  useEffect(() => setOpen(initially), [initially]);
  const kept = useTimeline((timeline) =>
    run ? timeline.entries.has(run.record.revisionId) : false,
  );
  if (!run) return null;
  const { record, live } = run;
  const paused = record.status === "paused";

  return (
    <section
      id={`run-${runId}`}
      aria-label={`${runLabel(record)}, ${STATUS[record.status]}`}
      className={cn(
        "border bg-evm-gray-800",
        paused ? "border-evm-yellow-300/60" : "border-foreground/10",
      )}
    >
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left font-sans text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen(!open)}
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 text-foreground/40 transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="font-semibold">{runLabel(record)}</span>
          <span
            className={cn(
              record.status === "error"
                ? "text-evm-pink-300"
                : record.status === "paused"
                  ? "text-evm-yellow-300"
                  : "text-foreground/65",
            )}
          >
            {STATUS[record.status]}
          </span>
          <span className="ml-auto shrink-0 text-xs text-foreground/45">
            {clock(record.startedAt, Date.now())}
          </span>
        </button>
        {!paused && <RunControls record={record} mine={!!live} />}
      </div>

      {paused && (
        <div className="flex flex-col gap-1.5 border-t border-foreground/10 px-3 py-2">
          {live?.held ? (
            <HeldRun run={live} />
          ) : (
            <p className="font-sans text-sm">
              Paused: {WHY[record.pausedBy ?? "left"]}
            </p>
          )}
          <div className="flex justify-end">
            <RunControls record={record} mine={!!live} />
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-foreground/10">
          <div className="max-h-[60vh] overflow-y-auto">
            <Console
              entries={consoleEntries(record.console)}
              errors={record.errors}
              placeholder={
                isUnfinished(record) ? "Nothing printed yet." : "No output."
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
            {record.output && (
              <button
                type="button"
                className={cn(
                  control,
                  "border-foreground/20 text-foreground/75",
                )}
                onClick={() => downloadOutput(record.output)}
              >
                Download output
              </button>
            )}
            {kept ? (
              <button
                type="button"
                className={cn(
                  control,
                  "border-foreground/20 text-foreground/75",
                )}
                onClick={() => setUi({ previewRevisionId: record.revisionId })}
              >
                View script
              </button>
            ) : (
              <span className="font-sans text-xs text-foreground/45">
                script no longer kept
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
