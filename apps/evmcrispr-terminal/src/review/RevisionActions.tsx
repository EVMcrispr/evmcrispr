import { type ReactNode, useState } from "react";
import { useSpace } from "../app/SpaceContext";
import { setUi } from "../app/ui-store";
import {
  restoreBefore,
  revertRevision,
  type UndoOutcome,
} from "./undo-revision";

/** A small action of a revision's row. */
export const RowAction = ({
  onClick,
  children,
}: {
  onClick(): void;
  children: ReactNode;
}) => (
  <button
    type="button"
    className="cursor-pointer rounded-(--radius) border border-foreground/20 px-2 py-0.5 font-sans text-xs text-foreground/75 outline-hidden hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
    onClick={onClick}
  >
    {children}
  </button>
);

const REFUSED = {
  conflict:
    "Later edits touch the same lines, so this change cannot be taken out on its own. Restore to before goes back to the script as it was before it.",
  "no-parent": "The script from before this change is no longer kept.",
};

/**
 * The two ways to take a recorded change back, wherever its revision is
 * listed: the timeline's row and the review. Offer it only for a revision
 * whose text from before is still kept. Either is an ordinary edit of the
 * script: Ctrl+Z undoes it, and whether the script is reviewed afterwards
 * is judged from the text it leaves, like any load.
 */
export function RevisionActions({
  revisionId,
  onDone,
}: {
  revisionId: string;
  /** The script was changed by one of the two. */
  onDone?(): void;
}) {
  const space = useSpace();
  const [refused, setRefused] = useState<keyof typeof REFUSED | null>(null);
  const run = (act: () => UndoOutcome) => () => {
    const outcome = act();
    setRefused(outcome.ok ? null : outcome.reason);
    if (!outcome.ok) return;
    // What is on screen is the script again, not a revision looked at.
    setUi({ previewRevisionId: null });
    onDone?.();
  };
  return (
    <>
      <RowAction onClick={run(() => revertRevision(space, revisionId))}>
        Revert this change
      </RowAction>
      <RowAction onClick={run(() => restoreBefore(space, revisionId))}>
        Restore to before
      </RowAction>
      {refused && (
        <p
          role="alert"
          className="w-full font-sans text-xs text-evm-yellow-300"
        >
          {REFUSED[refused]}
        </p>
      )}
    </>
  );
}
