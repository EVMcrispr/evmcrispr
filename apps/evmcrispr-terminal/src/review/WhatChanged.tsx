import { Button } from "@repo/ui";
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
      variant="outline"
      size="md"
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
        <p className="font-sans text-sm text-foreground/70">
          This script has changes you have not reviewed.
        </p>
        <div className="flex justify-start">{ask("Show the changes")}</div>
      </section>
    );
  return (
    <section aria-label="What changed" className="flex flex-col gap-2">
      <h3 className="font-sans text-sm font-semibold">
        {shown.nothingApproved
          ? "Nothing of this script is approved yet"
          : "What changed since the script you approved"}
      </h3>
      <ChangesDiff diff={shown.diff} />
      {shown.revisions.length > 0 && (
        <ol aria-label="Recorded changes" className="flex flex-col gap-1.5">
          {shown.revisions.map(({ entry, parent, added, removed }) => {
            const { who, what, claimed } = revisionLabel(entry, entries);
            return (
              <li
                key={entry.id}
                className="flex flex-col gap-1 bg-evm-gray-800 px-2 py-1.5 font-sans text-sm"
              >
                <p>
                  <span className="font-semibold text-foreground/85">
                    {who}
                  </span>{" "}
                  {claimed && (
                    <span className="text-foreground/45">
                      (it names {claimed}){" "}
                    </span>
                  )}
                  <span className="text-foreground/70">{what}</span>{" "}
                  <span className="text-xs">
                    <span className="text-evm-green-300">+{added}</span>{" "}
                    <span className="text-evm-pink-300">−{removed}</span>
                  </span>
                </p>
                {/* Offered on the script these rows describe, not on one
                    that moved on since. */}
                {!stale && byOthers(entry) && parent && (
                  <div className="flex flex-wrap gap-1.5">
                    <RevisionActions
                      revisionId={entry.id}
                      // The user's own move, just made: they are shown
                      // what it left.
                      onDone={approval.ask}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {stale && (
        <div className="flex flex-col gap-2 border border-evm-yellow-300/35 p-2">
          <p role="alert" className="font-sans text-xs text-evm-yellow-300">
            The script changed since this review was opened. What is shown above
            is the script as it was; nothing can be approved until you look at
            the new changes.
          </p>
          <div className="flex justify-start">
            {ask("Show the new changes")}
          </div>
        </div>
      )}
      {failedOn === shown && !stale && (
        <p role="alert" className="font-sans text-xs text-destructive">
          Nothing was approved. The script is still unreviewed: show the changes
          again and retry.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-xs text-foreground/55">
          To reject a change, revert it or restore the script to before it.
        </p>
        <Button
          type="button"
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
