import { Button } from "@repo/ui";
import { useApp } from "../../app/AppContext";
import { setUi } from "../../app/ui-store";
import {
  useActiveRun,
  useExecute,
  useRunningElsewhere,
} from "../../runs/useRun";

/** Execute, or what the run of the space on screen needs: Cancel while it
 *  runs, and the way to its card while it is paused. */
export function ExecuteButton() {
  const { runs } = useApp();
  const run = useActiveRun();
  const elsewhere = useRunningElsewhere();
  const execute = useExecute();

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
