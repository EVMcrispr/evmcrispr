import { useNow } from "@evmcrispr/editor";
import { Button, duration } from "@repo/ui";
import type { ReactNode } from "react";
import { useApp } from "../../app/AppContext";
import { ActionDetails } from "../../components/execution/ActionDetails";
import { actionSummary } from "../../runs/action-summary";
import type { LiveRun } from "../../runs/run-manager";

const WHY = {
  left: "you opened another space",
  declined: "you declined in your wallet",
};

/**
 * A paused run's held action and the only Resume there is. Resume hands
 * the wallet an action that was prepared before the pause, so it is never
 * offered without saying what that action is: why the run paused, what
 * will be sent and to whom, and for how long it has been held. All of it
 * is read from the held action itself, never from a simulation or the
 * script, so it cannot describe anything but what Resume sends.
 */
export function HeldRun({
  run,
  controls,
}: {
  run: LiveRun;
  /** What else can be done with the run, beside Resume. */
  controls?: ReactNode;
}) {
  const { runs } = useApp();
  const held = run.held;
  const now = useNow(held !== null);
  if (!held) return null;
  const heldFor = Math.max(0, now * 1000 - held.since);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group, not a form's fieldset
    <div
      role="group"
      aria-label="Held action"
      className="flex flex-col gap-2.5 font-sans text-body text-fg-muted"
    >
      <p className="m-0">
        Paused: {WHY[held.reason]}
        <span className="text-fg-faint">
          {" "}
          · {heldFor < 60_000 ? "just now" : `${duration(heldFor)} ago`}
        </span>
      </p>
      <ActionDetails description={actionSummary(held.action)} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {controls}
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => runs.resume(run.record.id)}
        >
          Resume
        </Button>
      </div>
    </div>
  );
}
