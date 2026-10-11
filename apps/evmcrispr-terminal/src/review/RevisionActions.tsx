import { Button, Notice } from "@repo/ui";
import { History, Undo2 } from "@repo/ui/icons";
import { type ReactNode, useState } from "react";
import { useSpace } from "../app/SpaceContext";
import { setUi } from "../app/ui-store";
import {
  restoreBefore,
  revertRevision,
  type UndoOutcome,
} from "./undo-revision";

/** A small action of a revision's row. With an icon, it is that icon
 *  alone on touch. */
export const RowAction = ({
  onClick,
  icon,
  children,
}: {
  onClick(): void;
  icon?: ReactNode;
  children: ReactNode;
}) => (
  <Button
    type="button"
    variant="quiet"
    size="row"
    icon={icon}
    onClick={onClick}
  >
    {children}
  </Button>
);

const REFUSED = {
  conflict:
    "Later edits touch the same lines, so this change cannot be taken out on its own.",
  "no-parent": "The script from before this change is no longer kept.",
};

/**
 * Takes a recorded change back, wherever its revision is listed: the
 * timeline's row and the review. Offer it only for a revision whose text
 * from before is still kept.
 *
 * "Undo this change" takes that one change out and keeps what was made
 * after it. When later edits touch the same lines it cannot: it says so,
 * and offers to go back to the script as it was before the change
 * instead. Either is an ordinary edit of the script: Ctrl+Z undoes it,
 * and whether the script is reviewed afterwards is judged from the text
 * it leaves, like any load.
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
      <RowAction
        icon={<Undo2 />}
        onClick={run(() => revertRevision(space, revisionId))}
      >
        Undo this change
      </RowAction>
      {refused && (
        <Notice
          tone="warning"
          urgent
          // After whatever else the row offers (its menu).
          className="order-last w-full"
          action={
            refused === "conflict" ? (
              <RowAction
                icon={<History />}
                onClick={run(() => restoreBefore(space, revisionId))}
              >
                Restore to before
              </RowAction>
            ) : undefined
          }
        >
          {REFUSED[refused]}
        </Notice>
      )}
    </>
  );
}
