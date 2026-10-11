import { Dialog } from "@repo/ui";
import { useEffect } from "react";
import { SimulationView } from "./SimulationView";
import { closeReview, useSurface } from "./surface";
import { useApproval, useReview } from "./useReview";
import { WhatChanged } from "./WhatChanged";

/** The review on desktop. Mounted only while open. What it shows, and
 *  whether anything on it can be approved, is the surface's: it is live
 *  only when the user asked for it (`askForReview`). */
export function ReviewDialog() {
  return useSurface().open ? <OpenReview /> : null;
}

function OpenReview() {
  const review = useReview();
  const approval = useApproval();
  // Looking at a change must not run it: a simulation executes the
  // script (web requests, remote modules, RPC), so it waits for the
  // button. Checking the script only reads it, and is done on opening.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on opening
  useEffect(() => {
    void review.validate();
  }, []);
  return (
    <Dialog open onOpenChange={(open) => !open && closeReview()}>
      <Dialog.Content
        size="lg"
        className="max-h-[90vh] grid-rows-[auto_minmax(0,1fr)] border-evm-yellow-300 outline-hidden"
        // The dialog itself takes the focus, not a button in it: Enter
        // or Space on opening presses nothing.
        tabIndex={-1}
        onOpenAutoFocus={(event: Event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        <Dialog.Header className="border-evm-yellow-300 bg-black text-evm-yellow-300">
          Review changes
        </Dialog.Header>
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-4">
          {review.unreviewed ? (
            <WhatChanged
              approval={approval}
              onApproved={closeReview}
              onAsked={() => void review.validate()}
            />
          ) : (
            <p className="font-sans text-sm text-foreground/70">
              The script is the one you approved. There is nothing to review.
            </p>
          )}
          <SimulationView review={review} stale={approval.stale} />
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
