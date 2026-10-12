import { Button } from "@repo/ui";
import { useApp } from "../../app/AppContext";
import { useSpace, useUnreviewed } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import { askForReview } from "../../review/surface";
import {
  useActiveRun,
  useExecute,
  useRunningElsewhere,
} from "../../runs/useRun";

/**
 * The one button under the script. What it is, first match wins:
 *  1. this tab runs the space: Stop (Cancel while paused, where nothing
 *     is going on to stop), and "Show paused run" while paused
 *     (that run executes the text it was started on, which was reviewed);
 *  2. the script is not the approved text: "Review changes", which opens
 *     the review;
 *  3. the space runs in another tab: Run, disabled, saying so;
 *  4. Simulate, which opens the review on a simulation of the script,
 *     and Run, which starts the run at once.
 * The button only chooses what to offer. Whether a run may start is
 * decided where it starts (`runs.start`), whatever was clicked.
 */
export function ExecuteButton() {
  const { runs } = useApp();
  const run = useActiveRun();
  const elsewhere = useRunningElsewhere();
  const execute = useExecute();
  const unreviewed = useUnreviewed();
  const space = useSpace();

  if (run)
    return (
      <>
        {/* Resume is offered where the held action is shown: the card. */}
        {run.record.status === "paused" && (
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setUi({ activeTab: "space", spaceView: "timeline" });
              requestAnimationFrame(() =>
                document
                  .getElementById(`run-${run.record.id}`)
                  ?.scrollIntoView({ block: "nearest" }),
              );
            }}
          >
            Show paused run
          </Button>
        )}
        <Button
          variant="neutral"
          size="md"
          onClick={() => runs.cancel(run.record.id)}
        >
          {run.record.status === "paused"
            ? "Cancel"
            : run.record.status === "watching"
              ? "Stop following"
              : "Stop"}
        </Button>
      </>
    );
  if (unreviewed)
    return (
      <Button variant="primary" size="md" onClick={() => askForReview(space)}>
        Review changes
      </Button>
    );
  return (
    <>
      {/* The review opens on a simulation of the script: what it would
          send, before anything is. */}
      <Button variant="neutral" size="md" onClick={() => askForReview(space)}>
        Simulate
      </Button>
      <span title={elsewhere ? "Running in another tab" : undefined}>
        <Button
          variant="primary"
          size="md"
          disabled={elsewhere}
          onClick={() => {
            // The run shows in the timeline, as it showed in the console.
            setUi({ activeTab: "space", spaceView: "timeline" });
            void execute();
          }}
        >
          Run
        </Button>
      </span>
    </>
  );
}
