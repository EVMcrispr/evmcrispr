import { AuthorLabel, Button, DiffStat, Notice, Row } from "@repo/ui";
import { useState } from "react";
import { useTimeline } from "../app/SpaceContext";
import { byOthers, revisionLabel } from "../space/revision-label";
import { ChangesDiff } from "./ChangesDiff";
import { RevisionActions } from "./RevisionActions";
import type { Approval } from "./useReview";

/**
 * What changed since the approved text, and the question "approve it?".
 * Everything here is the surface's snapshot (`approval.shown`): the diff,
 * the revisions, and the text Approve hands over. It does not change under
 * the user: when the script does, this says so, Approve is disabled, and
 * the new changes are shown only when the user asks for them. Approve sits
 * here, under what it approves, and nowhere else.
 */
export function WhatChanged({
  approval,
  onApproved,
  onAsked,
}: {
  approval: Approval;
  onApproved?(): void;
  /** The user asked to be shown the changes as they are now. */
  onAsked?(): void;
}) {
  const entries = useTimeline((timeline) => timeline.entries);
  const { shown, stale } = approval;
  // The snapshot an Approve failed on: said until another one is shown.
  const [failedOn, setFailedOn] = useState<typeof shown>(null);
  const ask = (label: string) => (
    <Button
      type="button"
      variant="neutral"
      size="sm"
      onClick={() => {
        approval.ask();
        onAsked?.();
      }}
    >
      {label}
    </Button>
  );
  if (!shown)
    return (
      <section aria-label="What changed" className="flex flex-col gap-2">
        <Notice tone="unverified">
          This script has changes you have not reviewed.
        </Notice>
        <div className="flex justify-start">{ask("Show the changes")}</div>
      </section>
    );
  return (
    <section aria-label="What changed" className="flex flex-col gap-2">
      <h3 className="m-0 font-head text-body font-bold text-fg">
        {shown.nothingApproved
          ? "Nothing of this script is approved yet"
          : "What changed since the script you approved"}
      </h3>
      <ChangesDiff diff={shown.diff} />
      {shown.revisions.length > 0 && (
        <ol
          aria-label="Recorded changes"
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {shown.revisions.map(({ entry, parent, added, removed }) => {
            const { who, what, claimed } = revisionLabel(entry, entries);
            // Offered on the script these rows describe, not on one that
            // moved on since.
            const undoable = !stale && byOthers(entry) && parent;
            return (
              <Row
                key={entry.id}
                as="li"
                wrap
                title={
                  <>
                    <AuthorLabel name={who} claimed={claimed} /> {what}
                  </>
                }
                meta={<DiffStat added={added} removed={removed} />}
              >
                {undoable && (
                  <RevisionActions
                    revisionId={entry.id}
                    // The user's own move, just made: they are shown
                    // what it left.
                    onDone={approval.ask}
                  />
                )}
              </Row>
            );
          })}
        </ol>
      )}
      {stale && (
        <Notice tone="warning" urgent action={ask("Show the new changes")}>
          The script changed since this review was opened. What is shown above
          is the script as it was; nothing can be approved until you look at the
          new changes.
        </Notice>
      )}
      {failedOn === shown && !stale && (
        <Notice tone="danger" layout="inline">
          Nothing was approved. The script is still unreviewed: show the changes
          again and retry.
        </Notice>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 font-sans text-caption text-fg-faint">
          To reject a change, revert it or restore the script to before it.
        </p>
        <Button
          type="button"
          variant="primary"
          size="md"
          // Not live until what it approves has been on screen a moment.
          disabled={!approval.armed}
          onClick={() => {
            // Closes only on an approval that was made.
            if (approval.approve() === true) onApproved?.();
            else setFailedOn(shown);
          }}
        >
          Approve
        </Button>
      </div>
    </section>
  );
}
