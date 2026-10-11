import { Button } from "@repo/ui";
import { ActionList } from "./ActionList";
import type { Review } from "./useReview";

/** Said wherever a simulation of a script is offered. */
export const SIMULATING_RUNS =
  "Simulating runs the script on a copy of the chain. Nothing is sent from your wallet, but the script may make web requests and load what it names.";

/** Said when a check left external modules unfetched. */
export function UnfetchedNote({ modules }: { modules: string[] }) {
  if (modules.length === 0) return null;
  return (
    <p className="font-sans text-xs text-evm-yellow-300">
      {modules.length === 1
        ? `The module "${modules[0]}" is loaded from elsewhere. It was not fetched and its commands were not checked`
        : `The modules ${modules.map((name) => `"${name}"`).join(", ")} are loaded from elsewhere. They were not fetched and their commands were not checked`}
      : that happens when you simulate, or once the script is approved.
    </p>
  );
}

/** What the script would do now: the diagnostics of a check, which only
 *  reads the script, and, once the user asks for it, the actions of a
 *  simulation of the very text the review shows. Nothing here simulates
 *  by itself: a simulation runs the script. */
export function SimulationView({
  review,
  stale = false,
}: {
  review: Review;
  /** The surface shows an earlier text than the script: nothing is
   *  simulated beside it until the user looks at the new one. */
  stale?: boolean;
}) {
  const { simulation } = review;
  const busy =
    simulation.status === "validating" || simulation.status === "simulating";
  if (stale)
    return (
      <section
        aria-label="What the script would do"
        className="flex flex-col gap-2"
      >
        <h3 className="font-sans text-sm font-semibold">
          What the script would do now
        </h3>
        <p className="font-sans text-xs text-foreground/60">
          The script changed. Show the new changes to check or simulate it.
        </p>
      </section>
    );
  return (
    <section
      aria-label="What the script would do"
      className="flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-sans text-sm font-semibold">
          What the script would do now
        </h3>
        {!busy && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void review.simulate()}
          >
            {simulation.status === "idle" || simulation.status === "valid"
              ? "Simulate to see what it would send"
              : "Simulate again"}
          </Button>
        )}
      </div>
      {(simulation.status === "idle" || simulation.status === "valid") && (
        <p className="font-sans text-xs text-foreground/60">
          {SIMULATING_RUNS}
        </p>
      )}
      <UnfetchedNote modules={review.unfetched} />
      {busy && (
        <p role="status" className="font-sans text-xs text-foreground/60">
          {simulation.status === "validating"
            ? "Checking the script…"
            : "Running on a simulated copy of the chain. Nothing is sent…"}
        </p>
      )}
      {simulation.status === "error" && (
        <p role="alert" className="font-sans text-xs text-destructive">
          {simulation.message}
        </p>
      )}
      {simulation.diagnostics.map((diagnostic, index) => (
        <p key={index} className="font-sans text-xs text-foreground/65">
          <span className="mr-2 font-mono text-destructive">
            L{diagnostic.line}:{diagnostic.col}
          </span>
          {diagnostic.message}
        </p>
      ))}
      {simulation.status === "ready" && (
        <p className="font-sans text-xs text-primary">
          Simulation passed. Nothing real moved.
        </p>
      )}
      {(simulation.status === "ready" ||
        (simulation.status === "error" && simulation.actions.length > 0)) && (
        <ActionList actions={simulation.actions} />
      )}
    </section>
  );
}
