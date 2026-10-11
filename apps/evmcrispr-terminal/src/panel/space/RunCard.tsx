import { Console, type ConsoleEntry, consoleEntries } from "@evmcrispr/editor";
import type { RunStatus } from "@evmcrispr/space";
import {
  Badge,
  Button,
  Card,
  IconButton,
  Menu,
  Time,
  type Tone,
} from "@repo/ui";
import { Download, Ellipsis, Eye, Trash2 } from "@repo/ui/icons";
import { useEffect, useState } from "react";
import { useApp } from "../../app/AppContext";
import { useSpace, useTimeline } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import { isUnfinished, type Run } from "../../runs/run-manager";
import { useRunOf } from "../../runs/useRun";
import { removeEntry } from "../../space/cleaning";
import { downloadOutput } from "../../utils/download-output";
import { Confirm, LeftBehind } from "./Confirm";
import { HeldRun } from "./HeldRun";

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

/** What a status says about the run: going on, needs the user, over. */
const TONE: Record<RunStatus, Tone> = {
  running: "success",
  paused: "warning",
  watching: "info",
  success: "success",
  error: "danger",
  cancelled: "neutral",
  interrupted: "neutral",
};

/** A run's status as a mark, with a dot while it is not over. */
export function StatusBadge({ record }: { record: Run }) {
  return (
    <Badge tone={TONE[record.status]} dot={isUnfinished(record)}>
      {STATUS[record.status]}
    </Badge>
  );
}

/** Stops a run this tab is running. A run of another tab can only be
 *  watched from here. Resume is not here: it lives with the held action
 *  it sends (`HeldRun`). */
export function RunControls({ record, mine }: { record: Run; mine: boolean }) {
  const { runs } = useApp();
  if (!isUnfinished(record)) return null;
  if (!mine) return <Badge>in another tab</Badge>;
  return (
    <Button
      type="button"
      variant="neutral"
      size="sm"
      className="shrink-0"
      onClick={() => runs.cancel(record.id)}
    >
      {record.status === "watching"
        ? "Stop following"
        : record.status === "paused"
          ? "Cancel"
          : "Stop"}
    </Button>
  );
}

const MARKS = [":success:", ":error:", ":waiting:"];

/** The last thing a run printed, in one line. */
function latestLine(entries: ConsoleEntry[]): string | undefined {
  const last = entries.at(-1);
  if (!last) return undefined;
  if (last.kind === "box") return `${last.box.title}: ${last.box.detail}`;
  const mark = MARKS.find((prefix) => last.text.startsWith(prefix));
  return (mark ? last.text.slice(mark.length) : last.text).trim();
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
  const [removing, setRemoving] = useState(false);
  const space = useSpace();
  const { me } = useApp();
  // The latest run opens by itself, and an earlier one closes when a
  // newer one takes its place.
  useEffect(() => setOpen(initially), [initially]);
  const kept = useTimeline((timeline) =>
    run
      ? timeline.entries.get(run.record.revisionId)?.kind === "revision"
      : false,
  );
  if (!run) return null;
  const { record, live } = run;
  const paused = record.status === "paused";
  const entries = consoleEntries(record.console);
  const controls = <RunControls record={record} mine={!!live} />;

  return (
    <>
      <Card
        id={`run-${runId}`}
        aria-label={`${runLabel(record)}, ${STATUS[record.status]}`}
        // The frame speaks only when the run needs the user or failed.
        tone={
          paused
            ? "warning"
            : record.status === "error"
              ? "danger"
              : record.unverified
                ? "unverified"
                : "neutral"
        }
        open={open}
        onOpenChange={setOpen}
      >
        <Card.Header
          title={runLabel(record)}
          status={
            <>
              {record.unverified && (
                <Badge tone="unverified">from an export</Badge>
              )}
              <StatusBadge record={record} />
            </>
          }
          time={<Time at={record.startedAt} format="clock" />}
        />

        {paused && (
          <div className="border-t-2 border-line p-2.5">
            {live?.held ? (
              <HeldRun run={live} controls={controls} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 font-sans text-body text-fg-muted">
                <p className="m-0">Paused: {WHY[record.pausedBy ?? "left"]}</p>
                {controls}
              </div>
            )}
          </div>
        )}

        <Card.Body className="gap-0 p-0">
          <div className="max-h-[60vh] overflow-y-auto">
            <Console
              entries={entries}
              errors={record.errors}
              // The one place output is rendered as markdown: a run made
              // by this browser. One an export brought is plain text,
              // and its console says so itself whatever is asked here.
              markdown={!record.unverified}
              placeholder={
                isUnfinished(record) ? "Nothing printed yet." : "No output."
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t-2 border-line p-2.5">
            {kept ? (
              <Button
                type="button"
                variant="quiet"
                size="row"
                icon={<Eye />}
                onClick={() => setUi({ previewRevisionId: record.revisionId })}
              >
                View script
              </Button>
            ) : (
              <Badge>script no longer kept</Badge>
            )}
            {(record.output || !isUnfinished(record)) && (
              <Menu>
                <Menu.Trigger
                  render={
                    <IconButton
                      type="button"
                      variant="quiet"
                      size="sm"
                      aria-label="More actions"
                    />
                  }
                >
                  <Ellipsis aria-hidden />
                </Menu.Trigger>
                <Menu.Content align="start">
                  {record.output && (
                    <Menu.Item onClick={() => downloadOutput(record.output)}>
                      <Download aria-hidden />
                      Download output
                    </Menu.Item>
                  )}
                  {!isUnfinished(record) && (
                    <Menu.Item onClick={() => setRemoving(true)}>
                      <Trash2 aria-hidden />
                      Remove…
                    </Menu.Item>
                  )}
                </Menu.Content>
              </Menu>
            )}
          </div>
        </Card.Body>

        {/* While it goes on: the last line it printed, which opens the
            card, and the way to stop it. */}
        {isUnfinished(record) && !paused && (
          <Card.Footer summary={latestLine(entries) ?? "Nothing printed yet."}>
            {controls}
          </Card.Footer>
        )}
      </Card>
      {removing && (
        <Confirm
          title="Remove this run"
          action="Remove"
          onConfirm={() => removeEntry(space, runId, me(), Date.now())}
          onClose={() => setRemoving(false)}
        >
          <p>
            This removes this {runLabel(record).toLowerCase()} and everything it
            printed from the timeline, for good.
          </p>
          <LeftBehind action="remove" />
        </Confirm>
      )}
    </>
  );
}
