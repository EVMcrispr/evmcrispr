import { useNow } from "@evmcrispr/editor";
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
export function HeldRun({ run }: { run: LiveRun }) {
  const { runs } = useApp();
  const held = run.held;
  const now = useNow(held !== null);
  if (!held) return null;
  const minutes = Math.max(0, Math.floor((now * 1000 - held.since) / 60_000));

  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group, not a form's fieldset
    <div
      role="group"
      aria-label="Held action"
      className="flex flex-col gap-1.5 font-sans text-sm"
    >
      <p>
        Paused: {WHY[held.reason]}
        <span className="text-foreground/50">
          {" "}
          · {minutes < 1 ? "just now" : `${minutes} min ago`}
        </span>
      </p>
      <ActionDetails description={actionSummary(held.action)} />
      <div className="flex justify-end">
        <button
          type="button"
          className="cursor-pointer rounded-(--radius) border border-primary px-2 py-0.5 font-sans text-xs text-primary outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => runs.resume(run.record.id)}
        >
          Resume
        </button>
      </div>
    </div>
  );
}
