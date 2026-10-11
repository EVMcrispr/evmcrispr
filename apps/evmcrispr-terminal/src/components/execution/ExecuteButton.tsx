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
 *  1. this tab runs the space: Cancel, and "Show paused run" while paused
 *     (that run executes the text it was started on, which was reviewed);
 *  2. the script is not the approved text: "Review changes", which opens
 *     the review;
 *  3. the space runs in another tab: Execute, disabled, saying so;
 *  4. Execute.
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
            variant="default"
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
          variant="outline"
          size="md"
          onClick={() => runs.cancel(run.record.id)}
        >
          Cancel
        </Button>
      </>
    );
  if (unreviewed)
    return (
      <Button variant="default" size="md" onClick={() => askForReview(space)}>
        Review changes
      </Button>
    );
  return (
    <span title={elsewhere ? "Running in another tab" : undefined}>
      <Button
        variant="default"
        size="md"
        disabled={elsewhere}
        onClick={() => {
          // The run shows in the timeline, as it showed in the console.
          setUi({ activeTab: "space", spaceView: "timeline" });
          void execute();
        }}
      >
        Execute
      </Button>
    </span>
  );
}
