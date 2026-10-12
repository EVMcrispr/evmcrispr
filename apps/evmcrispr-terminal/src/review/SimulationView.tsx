import { Button, Notice } from "@repo/ui";
import type { ReactNode } from "react";
import { ActionList } from "./ActionList";
import type { Review } from "./useReview";

/** Said beside the way to simulate a script that was not reviewed:
 *  simulating runs it. */
export const SIMULATING_RUNS =
  "Simulating runs these unapproved changes. They can make web requests and load modules, but nothing is sent from your wallet.";

/** Said when a check left external modules unfetched. */
export function UnfetchedNote({ modules }: { modules: string[] }) {
  if (modules.length === 0) return null;
  return (
    <Notice tone="warning" layout="inline">
      {modules.length === 1
        ? `The module "${modules[0]}" is loaded from elsewhere. It was not fetched and its commands were not checked`
        : `The modules ${modules.map((name) => `"${name}"`).join(", ")} are loaded from elsewhere. They were not fetched and their commands were not checked`}
      : that happens when you simulate, or once the script is approved.
    </Notice>
  );
}

/** What the script would do now: the diagnostics of a check, which only
 *  reads the script, and, once the user asks for it, the actions of a
 *  simulation of the very text the review shows. Nothing here simulates
 *  by itself: a simulation runs the script. */
export function SimulationView({
  review,
  stale = false,
  summary,
  offered = false,
}: {
  /** The way to simulate is beside Approve: not repeated here. */
  offered?: boolean;
  review: Review;
  /** Said above the actions of a simulation that passed. */
  summary?: ReactNode;
  /** The user is not looking at the script's changes as they are now
   *  (not shown yet, or the script moved on): nothing is checked or
   *  simulated beside them until they are. */
  stale?: boolean;
}) {
  const { simulation } = review;
  const busy =
    simulation.status === "validating" || simulation.status === "simulating";
  const fresh = simulation.status === "idle" || simulation.status === "valid";
  if (stale)
    return (
      <section
        aria-label="What the script would do"
        className="flex flex-col gap-2"
      >
        <h3 className="m-0 font-head text-body font-bold text-fg">
          What the script would do now
        </h3>
        <p className="m-0 font-sans text-caption text-fg-faint">
          Show the changes as they are now to check or simulate the script.
        </p>
      </section>
    );
  return (
    <section
      aria-label="What the script would do"
      className="flex flex-col gap-2"
    >
      {/* Before anything was simulated there is nothing to say: only the
          way to ask for it. */}
      {fresh ? (
        !busy &&
        !offered && (
          <div>
            <Button
              type="button"
              variant="neutral"
              size="sm"
              onClick={() => void review.simulate()}
            >
              Simulate
            </Button>
          </div>
        )
      ) : (
        <div className="flex items-center justify-between gap-3">
          <h3 className="m-0 font-head text-body font-bold text-fg">
            What the script would do now
          </h3>
          {!busy && (
            <Button
              type="button"
              variant="neutral"
              size="sm"
              onClick={() => void review.simulate()}
            >
              Simulate again
            </Button>
          )}
        </div>
      )}
      <UnfetchedNote modules={review.unfetched} />
      {busy && (
        <Notice tone="info" layout="inline" live>
          {simulation.status === "validating"
            ? "Checking the script…"
            : "Running on a simulated copy of the chain. Nothing is sent…"}
        </Notice>
      )}
      {simulation.status === "error" && (
        <Notice tone="danger" layout="inline">
          {simulation.message}
        </Notice>
      )}
      {simulation.diagnostics.map((diagnostic, index) => (
        <p key={index} className="m-0 font-sans text-caption text-fg-muted">
          <span className="mr-2 font-mono text-danger">
            L{diagnostic.line}:{diagnostic.col}
          </span>
          {diagnostic.message}
        </p>
      ))}
      {simulation.status === "ready" && (
        <p className="m-0 font-sans text-caption text-success">
          Simulation passed. Nothing real moved.
        </p>
      )}
      {summary}
      {(simulation.status === "ready" ||
        (simulation.status === "error" && simulation.actions.length > 0)) && (
        <ActionList actions={simulation.actions} />
      )}
    </section>
  );
}
