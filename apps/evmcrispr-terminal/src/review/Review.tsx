import type { Action, TransactionAction } from "@evmcrispr/sdk";
import { Button, Overlay } from "@repo/ui";
import { useEffect } from "react";
import { chainLabel, shortAddress } from "../runs/action-summary";
import { useActiveRun, useExecute } from "../runs/useRun";
import { useWallet } from "../wallet/WalletContext";
import { countActions } from "./ActionList";
import { SimulationView } from "./SimulationView";
import { closeReview } from "./surface";
import type { Approval, Review as ReviewState } from "./useReview";
import { WhatChanged } from "./WhatChanged";

function flattenActions(actions: Action[]): Action[] {
  return actions.flatMap((action) =>
    "type" in action && action.type === "batched" ? action.actions : [action],
  );
}

function actionChainId(action: Action): number | undefined {
  if (!("type" in action)) return (action as TransactionAction).chainId;
  if (action.type === "batched" || action.type === "smartBatch")
    return action.chainId;
  return undefined;
}

/** Distinct chains the script's actions target, in execution order.
 *  Scripts can `switch` chains mid-run, so this is derived from the
 *  resolved actions rather than the wallet's current network. */
function targetChainIds(actions: Action[]): number[] {
  const ids: number[] = [];
  for (const action of actions) {
    const chainId = actionChainId(action);
    if (chainId !== undefined && !ids.includes(chainId)) ids.push(chainId);
  }
  return ids;
}

/** Where the simulated actions go, who sends them, and how many. */
function Summary({ actions }: { actions: Action[] }) {
  const { address, chainName } = useWallet();
  const chainIds = targetChainIds(flattenActions(actions));
  const count = countActions(actions);
  const facts = [
    {
      term: chainIds.length > 1 ? "Networks" : "Network",
      value:
        chainIds.length === 0
          ? (chainName ?? "From script")
          : chainIds.length > 1
            ? `${chainIds.length} networks`
            : chainLabel(chainIds[0]),
    },
    { term: "From", value: shortAddress(address, "No wallet connected") },
    { term: "Total", value: `${count} action${count === 1 ? "" : "s"}` },
  ];
  return (
    <dl className="m-0 grid grid-cols-3 divide-x-2 divide-line border-2 border-edge bg-surface-1">
      {facts.map(({ term, value }) => (
        <div key={term} className="min-w-0 p-2.5">
          <dt className="font-sans text-caption text-fg-faint">{term}</dt>
          <dd className="m-0 mt-1 truncate font-sans text-caption text-fg">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The review of the space on screen, the same on a desktop (a dialog) and
 * on a phone (a sheet): what changed since the approved text, when
 * something did; what the script would do, from a simulation; and the
 * button that hands it to the wallet. Mounted only while open.
 *
 * It ends where signing starts. The run it asks for is followed in its
 * card in the timeline, which is where `onRun` leads.
 *
 * It starts nothing by itself: the button asks for a run of the very text
 * the simulation shown here was made of, and whether that run may start is
 * decided where runs start.
 */
export function Review({
  review,
  approval,
  sheet = false,
  onRun,
  onApproved,
}: {
  review: ReviewState;
  /** Which text the user asked to review here. */
  approval: Approval;
  /** A sheet from the bottom, for the phone's layout. */
  sheet?: boolean;
  /** A run was asked for, or the user wants the one going on: show the
   *  space's timeline. */
  onRun(): void;
  /** The changes were approved. Where the button that runs the script is
   *  outside the review (a desktop), the review is done; where it is this
   *  review's own (a phone), the user goes on to it. */
  onApproved?(): void;
}) {
  const wallet = useWallet();
  const execute = useExecute();
  const inFlight = useActiveRun() !== null;

  // Beside changes the user is not looking at as they are now (a review
  // that came up without their asking, or a script that moved on since
  // they asked), nothing is checked and nothing is simulated, and nothing
  // here offers to: they are shown the changes first.
  const asked = approval.shown !== null;
  const current = !review.unreviewed || (asked && !approval.stale);

  // Only for a review the user asked for. Looking at a change must not
  // run it: a simulation executes the script (web requests, remote
  // modules, RPC), so for text the user has not approved it waits for the
  // button, and opening only checks it, which reads it. A script they
  // approved is simulated for them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on opening
  useEffect(() => {
    if (!asked) return;
    if (review.unreviewed) void review.validate();
    else if (review.simulation.status !== "ready") void review.simulate();
  }, []);

  const { simulation } = review;
  const ready = simulation.status === "ready";
  const busy =
    simulation.status === "validating" || simulation.status === "simulating";
  const count = ready ? countActions(simulation.actions) : 0;
  const start = () => {
    void execute(review.text);
    closeReview();
    onRun();
  };

  const footer = inFlight ? (
    <>
      <p className="m-0 min-w-40 flex-1 font-sans text-caption text-fg-muted">
        A run of this space is going on.
      </p>
      <Button
        type="button"
        variant="neutral"
        onClick={() => {
          closeReview();
          onRun();
        }}
      >
        Show the run
      </Button>
    </>
  ) : review.unreviewed ? (
    <p className="m-0 font-sans text-caption text-fg-muted">
      Approve the changes above before your wallet is asked for anything.
    </p>
  ) : (
    <div className="flex w-full flex-col gap-2.5">
      {!wallet.address ? (
        <Button
          type="button"
          variant="primary"
          className="w-full"
          onClick={() => {
            closeReview();
            wallet.connectWallet();
          }}
        >
          Connect wallet to continue
        </Button>
      ) : (
        ready && (
          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={!review.canExecute}
            onClick={start}
          >
            Confirm {count} action{count === 1 ? "" : "s"} in wallet
          </Button>
        )
      )}
      {/* A run can always be asked for without the simulation, or before
          a wallet is connected: what it needs, it asks for itself. */}
      {!busy && (!ready || !wallet.address) && (
        <Button
          type="button"
          variant="quiet"
          className="w-full"
          onClick={start}
        >
          Run script without simulation
        </Button>
      )}
    </div>
  );

  return (
    <Overlay
      open
      onOpenChange={(open) => !open && closeReview()}
      sheet={sheet}
      title={review.unreviewed ? "Review changes" : "Review transactions"}
      description="Simulated first. Your wallet signs last."
      tone={review.unreviewed ? "warning" : "neutral"}
      size="lg"
      closeLabel="Close review"
      // The review itself takes the focus, not a button in it: Enter or
      // Space on opening presses nothing.
      focus="popup"
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        {/* Approve is in this section, not in the footer where the
            wallet's confirmation is. */}
        {review.unreviewed && (
          <WhatChanged
            approval={approval}
            onApproved={onApproved}
            onAsked={() => void review.validate()}
          />
        )}
        <SimulationView
          review={review}
          stale={!current}
          summary={ready ? <Summary actions={simulation.actions} /> : null}
        />
      </div>
    </Overlay>
  );
}
