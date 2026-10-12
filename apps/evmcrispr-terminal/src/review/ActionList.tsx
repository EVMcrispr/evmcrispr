import type { Action } from "@evmcrispr/sdk";
import { ActionDetails } from "../components/execution/ActionDetails";
import { actionSummary, normaliseAction } from "../runs/action-summary";

/** How many requests the actions come to: each call of a batch and each
 *  step of a plan counts. */
export function countActions(actions: Action[]): number {
  return actions.reduce(
    (count, action) =>
      count +
      ("executionPlan" in action && action.executionPlan
        ? action.executionPlan.steps.length
        : "type" in action && action.type === "batched"
          ? action.actions.length
          : "type" in action && action.type === "smartBatch"
            ? action.plan.steps.length
            : 1),
    0,
  );
}

/** What a simulation resolved, each action described by the one function
 *  that describes actions, in full: nothing here is a second wording. */
export function ActionList({ actions }: { actions: Action[] }) {
  if (actions.length === 0)
    return (
      <p className="m-0 font-sans text-caption text-fg-faint">
        The script asks the wallet for nothing.
      </p>
    );
  return (
    <ol aria-label="Actions" className="m-0 flex list-none flex-col gap-2 p-0">
      {actions.map((action, index) => (
        <li key={index} className="flex gap-2">
          <span className="mt-1.5 w-5 shrink-0 text-right font-mono text-caption text-primary">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            {/* Described in the form a run sends it in. */}
            <ActionDetails
              description={actionSummary(normaliseAction(action))}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
