import { Badge, type Tone } from "@repo/ui";
import type { Simulation } from "./useReview";

/** The word for a script that is not the text the user approved. The
 *  one word, wherever it is said: lists, the timeline, the script. */
export const UNREVIEWED = "unreviewed";

/** The mark of a script, or of a change, nobody approved. `dot` on the
 *  mark of a whole script; a change in a list of them goes without. */
export function UnreviewedBadge({ dot = false }: { dot?: boolean }) {
  return (
    <Badge tone="unverified" dot={dot}>
      {UNREVIEWED}
    </Badge>
  );
}

/** What the last check of a script found, in the words every view uses.
 *  Nothing while it was not checked: that is not a state to report, and
 *  it is not whether the script was reviewed. */
export function checkState(
  simulation: Simulation,
): { label: string; tone: Tone; busy: boolean } | null {
  switch (simulation.status) {
    case "validating":
      return { label: "Validating…", tone: "neutral", busy: true };
    case "simulating":
      return { label: "Simulating…", tone: "neutral", busy: true };
    case "valid":
      return { label: "Valid", tone: "success", busy: false };
    case "ready":
      return { label: "Simulated", tone: "success", busy: false };
    case "error":
      return { label: "Error", tone: "danger", busy: false };
    default:
      return null;
  }
}

/** The check's finding as a mark, where there is one. */
export function CheckBadge({ simulation }: { simulation: Simulation }) {
  const state = checkState(simulation);
  if (!state) return null;
  return (
    <span role="status">
      <Badge variant="tag" tone={state.tone} dot>
        {state.label}
      </Badge>
    </span>
  );
}
