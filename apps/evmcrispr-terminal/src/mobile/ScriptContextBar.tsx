import { Button, cn, Dot, IconButton } from "@repo/ui";
import { Boxes, FlaskConical } from "@repo/ui/icons";
import { SCRIPT_MORPH, TITLE_MORPH } from "../app/morph";
import { useScript } from "../app/SpaceContext";
import type { Simulation } from "../review/useReview";

export function ScriptContextBar({
  simulation,
  resultUnseen,
  onOpenSpaces,
  onOpenSpace,
  onSimulate,
}: {
  /** To the list of every space. */
  onOpenSpaces: () => void;
  /** The check of the script as it is: only whether one is going on is
   *  shown here. What it found is said where it is opened. */
  simulation: Simulation;
  /** A simulation finished that the user has not looked at. */
  resultUnseen: boolean;
  /** The name is the space: it opens its timeline, where the script is. */
  onOpenSpace: () => void;
  /** Opens the simulation of the script. (Reviewing a change is another
   *  thing: approving text someone else wrote.) */
  onSimulate: () => void;
}) {
  const { title } = useScript();
  const busy =
    simulation.status === "validating" || simulation.status === "simulating";

  return (
    <nav
      aria-label="Space"
      className="mx-3 mt-2 mb-1 flex shrink-0 items-stretch"
    >
      <div
        style={{ viewTransitionName: SCRIPT_MORPH }}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-(--radius) border-2 border-edge bg-surface-1 p-1"
      >
        {/* The mark of the space is the way to all of them: it says so
            when pointed at. */}
        <IconButton
          type="button"
          variant="quiet"
          size="sm"
          aria-label="All spaces"
          className="hover:text-success"
          onClick={onOpenSpaces}
        >
          <Boxes aria-hidden />
        </IconButton>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Open space"
          className="min-w-0 flex-1 justify-start px-2 text-fg"
          onClick={onOpenSpace}
        >
          <span
            style={{ viewTransitionName: TITLE_MORPH }}
            className={cn("truncate", !title && "text-fg-faint")}
          >
            {title || "Untitled"}
          </span>
        </Button>

        {/* Always the same words: they say what the panel it opens is
            for (a run can be started there with or without simulating),
            not what the last simulation found. */}
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="relative gap-1.5 px-2"
          onClick={onSimulate}
        >
          <FlaskConical
            aria-hidden
            className={cn("size-4", busy && "animate-pulse")}
          />
          Simulate & Run
          {resultUnseen && (
            <Dot tone="success" className="absolute -top-1 -right-1" />
          )}
        </Button>
      </div>
    </nav>
  );
}
