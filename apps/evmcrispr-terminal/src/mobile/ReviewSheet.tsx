import type { ConsoleEntry } from "@evmcrispr/editor";
import { countdownText, useNow } from "@evmcrispr/editor";
import type { Action, TransactionAction } from "@evmcrispr/sdk";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, Drawer, IconButton } from "@repo/ui";
import type { ReactNode } from "react";
import { ActionList, countActions } from "../review/ActionList";
import { SIMULATING_RUNS, UnfetchedNote } from "../review/SimulationView";
import type { Approval, Review } from "../review/useReview";
import { WhatChanged } from "../review/WhatChanged";
import { chainLabel, shortAddress } from "../runs/action-summary";

/** Where the run the sheet follows stands: its phase while the script
 *  runs, else its status. */
export type ExecutionPhase =
  | "idle"
  | "preparing"
  | "running"
  | "awaiting-wallet"
  | "paused"
  /** The script ended; the run follows live status boxes until they end. */
  | "watching"
  | "success"
  | "cancelled"
  | "error"
  | "interrupted";

const PHASE_COPY: Record<
  ExecutionPhase,
  { title: string; description: string }
> = {
  idle: {
    title: "No active execution",
    description: "Simulation and wallet activity will appear here.",
  },
  preparing: {
    title: "Preparing transactions",
    description: "Resolving the script before opening your wallet.",
  },
  running: {
    title: "Running script",
    description: "Processing script commands.",
  },
  "awaiting-wallet": {
    title: "Check your wallet",
    description: "Review the wallet prompt and provide final approval.",
  },
  paused: {
    title: "Run paused",
    description: "Resume to continue.",
  },
  interrupted: {
    title: "Run interrupted",
    description: "The page was closed while it ran.",
  },
  watching: {
    title: "Following status",
    description: "The script finished; the run stays open until they end.",
  },
  success: {
    title: "Execution complete",
    description: "All actions confirmed.",
  },
  cancelled: {
    title: "Execution cancelled",
    description: "No further actions will be submitted.",
  },
  error: {
    title: "Execution failed",
    description: "Review the error before trying again.",
  },
};

function json(value: unknown) {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
}

export function followingCopy(count: number): string {
  return `Following ${count} status box${count === 1 ? "" : "es"}…`;
}

/** Console lines for the compact mobile log: plain lines as they are, each
 *  status box as one `title: detail` line. */
function consoleLines(
  entries: ConsoleEntry[],
  now: number,
): { text: string; box: boolean }[] {
  return entries.map((entry) => {
    if (entry.kind === "line") return { text: entry.text, box: false };
    const { title, detail, state, countdown } = entry.box;
    const left =
      state === "live" && countdown
        ? ` (${countdownText(countdown, now)})`
        : "";
    return { text: `${title}: ${detail}${left}`, box: true };
  });
}

function anyBoxFailed(entries: ConsoleEntry[]): boolean {
  return entries.some(
    (entry) => entry.kind === "box" && entry.box.state === "failed",
  );
}

export function ActivityPanel({
  phase,
  logs,
  entries,
  followingBoxes = 0,
  errors,
  executed,
  rawActions,
}: {
  phase: ExecutionPhase;
  logs: string[];
  /** Lines and status boxes in order; `logs` is used when absent. */
  entries?: ConsoleEntry[];
  /** Live status boxes the run follows (shown in the watching phase). */
  followingBoxes?: number;
  errors: string[];
  executed: { action: Action; result?: unknown }[];
  rawActions: unknown;
}) {
  const copy = PHASE_COPY[phase];
  // Ticks only while a live box counts down.
  const now = useNow(
    entries?.some(
      (e) => e.kind === "box" && e.box.state === "live" && e.box.countdown,
    ) ?? false,
  );
  const lines = entries
    ? consoleLines(entries, now)
    : logs.map((text) => ({ text, box: false }));

  return (
    <div className="flex flex-col gap-3 border-t border-foreground/10 p-3">
      <section
        className={`border p-3 ${
          phase === "error" || phase === "cancelled" || phase === "interrupted"
            ? "border-destructive/45 bg-destructive/5"
            : "border-primary/35 bg-primary/4"
        }`}
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          {phase === "error" ||
          phase === "cancelled" ||
          phase === "interrupted" ? (
            <ExclamationTriangleIcon className="size-5 shrink-0 text-destructive" />
          ) : (
            <CheckCircleIcon className="size-5 shrink-0 text-primary" />
          )}
          <div>
            <h3 className="font-sans text-xs font-semibold">{copy.title}</h3>
            <p className="mt-0.5 font-sans text-xs leading-relaxed text-foreground/55">
              {phase === "watching"
                ? followingCopy(followingBoxes)
                : phase === "success" && entries && anyBoxFailed(entries)
                  ? "The script finished, but a status box failed."
                  : copy.description}
            </p>
          </div>
        </div>
      </section>

      {executed.length > 0 && (
        <section>
          <h3 className="mb-2 font-sans text-[10px] uppercase tracking-wider text-foreground/40">
            Executed actions
          </h3>
          <div className="flex flex-col gap-2">
            {executed.map(({ action }, index) => (
              <div
                key={index}
                className="flex min-h-10 items-center gap-3 border border-foreground/10 px-3"
              >
                <span className="flex size-6 items-center justify-center rounded-full border border-primary/35 font-mono text-[10px] text-primary">
                  {index + 1}
                </span>
                <span className="font-sans text-xs text-foreground/65">
                  {"type" in action
                    ? action.type
                    : action.to
                      ? `Contract ${action.to.slice(0, 6)}…${action.to.slice(-4)}`
                      : "Contract deployment"}
                </span>
                <CheckCircleIcon className="ml-auto size-4 text-primary" />
              </div>
            ))}
          </div>
        </section>
      )}

      {(lines.length > 0 || errors.length > 0) && (
        <section>
          <h3 className="mb-2 font-sans text-[10px] uppercase tracking-wider text-foreground/40">
            Console
          </h3>
          <div className="max-h-60 overflow-auto border border-foreground/10 bg-black/55 p-3 font-mono text-[11px] leading-relaxed">
            {lines.map((line, index) => (
              <p
                key={`log-${index}`}
                className={
                  line.box ? "text-foreground/85" : "text-foreground/65"
                }
              >
                {line.text}
              </p>
            ))}
            {errors.map((error, index) => (
              <p key={`error-${index}`} className="text-destructive">
                {error}
              </p>
            ))}
          </div>
        </section>
      )}

      <details className="group/raw border border-foreground/10">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 font-sans text-xs text-foreground/55">
          Raw calldata
          <ChevronDownIcon className="size-4 group-open/raw:rotate-180" />
        </summary>
        <pre className="max-h-60 overflow-auto border-t border-foreground/10 bg-black/55 p-3 font-mono text-[10px] leading-relaxed text-foreground/60">
          {json(rawActions)}
        </pre>
      </details>
    </div>
  );
}

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

/**
 * The review on mobile: what changed since the approved text, when
 * something did, above what the script would do and the run it leads to.
 * It starts nothing by itself: Confirm asks for a run of the very text the
 * simulation shown here was made of, and whether that run may start is
 * decided where runs start.
 */
export function ReviewSheet({
  open,
  onOpenChange,
  review,
  approval,
  chainName,
  address,
  executionPhase,
  onExecute,
  onConnect,
  entries,
  followingBoxes = 0,
  ioControl,
  errors,
  executed,
  onCancel,
  heldRun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: Review;
  /** Which text the user asked to review on this sheet. */
  approval: Approval;
  chainName: string | undefined;
  address: `0x${string}` | undefined;
  executionPhase: ExecutionPhase;
  /** Asks for a real run of `shown`, the text on display. */
  onExecute: (shown: string) => void;
  onConnect: () => void;
  entries?: ConsoleEntry[];
  followingBoxes?: number;
  ioControl?: ReactNode;
  errors: string[];
  executed: { action: Action; result?: unknown }[];
  onCancel: () => void;
  /** A paused run's held action, with its Resume. */
  heldRun?: ReactNode;
}) {
  // Beside changes the user is not looking at as they are now (not asked
  // for yet, or the script moved on), nothing is checked or simulated.
  const current =
    !review.unreviewed || (approval.shown !== null && !approval.stale);
  const state: Review["simulation"] = current
    ? review.simulation
    : { status: "idle", diagnostics: [] };
  const actionCount =
    state.status === "ready" ? countActions(state.actions) : 0;
  // A run in flight (paused, or only watching boxes, included) keeps the
  // sheet busy.
  const inFlight =
    executionPhase === "preparing" ||
    executionPhase === "paused" ||
    executionPhase === "running" ||
    executionPhase === "awaiting-wallet" ||
    executionPhase === "watching";
  const busy =
    inFlight || state.status === "validating" || state.status === "simulating";
  const chainIds =
    state.status === "ready"
      ? targetChainIds(flattenActions(state.actions))
      : [];
  const multiChain = chainIds.length > 1;
  const networkLabel =
    chainIds.length === 0
      ? (chainName ?? "From script")
      : multiChain
        ? `${chainIds.length} networks`
        : chainLabel(chainIds[0]);
  const activity = (rawActions: unknown) => (
    <ActivityPanel
      phase={executionPhase}
      logs={[]}
      entries={entries}
      followingBoxes={followingBoxes}
      errors={errors}
      executed={executed}
      rawActions={rawActions}
    />
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" modal>
      <Drawer.Content
        side="bottom"
        className="mobile-review-sheet max-h-[94dvh] border-foreground/15 bg-[#0b0d0c]"
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-foreground/25" />
        <Drawer.Header className="border-foreground/10 px-4 py-3">
          <div>
            <Drawer.Title className="font-sans text-xl">
              Review transactions
            </Drawer.Title>
            <Drawer.Description className="font-sans text-xs">
              Simulated first. Your wallet signs last.
            </Drawer.Description>
          </div>
          <Drawer.Close asChild>
            <IconButton
              type="button"
              aria-label="Close transaction review"
              variant="ghost"
              size="lg"
              className="min-h-11 min-w-11"
            >
              <XMarkIcon className="size-5" />
            </IconButton>
          </Drawer.Close>
        </Drawer.Header>

        {ioControl && <div className="px-4 pt-3">{ioControl}</div>}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {/* Approve is in this section, not in the footer where the
              wallet's confirmation is. */}
          {review.unreviewed && (
            <WhatChanged
              approval={approval}
              onAsked={() => void review.validate()}
            />
          )}

          {current && <UnfetchedNote modules={review.unfetched} />}
          {(state.status === "validating" || state.status === "simulating") && (
            <div
              className="flex min-h-64 flex-col items-center justify-center gap-4"
              role="status"
              aria-live="polite"
            >
              <div className="size-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
              <div className="text-center">
                <p className="font-sans text-base font-semibold">
                  {state.status === "validating"
                    ? "Checking the script"
                    : "Running on a simulated copy of the chain"}
                </p>
                <p className="mt-1 font-sans text-xs text-foreground/50">
                  No transaction is being broadcast.
                </p>
              </div>
            </div>
          )}

          {state.status === "error" && (
            <div className="flex flex-col gap-4" role="alert">
              <div className="border border-destructive/45 bg-destructive/6 p-4">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="size-6 shrink-0 text-destructive" />
                  <div>
                    <p className="font-sans text-sm font-semibold">
                      The simulation did not pass
                    </p>
                    <p className="mt-1 font-sans text-xs leading-relaxed text-foreground/60">
                      {state.message}
                    </p>
                  </div>
                </div>
              </div>
              {state.diagnostics.length > 0 && (
                <div className="flex flex-col gap-2">
                  {state.diagnostics.slice(0, 6).map((diagnostic, index) => (
                    <div
                      key={`${diagnostic.line}:${diagnostic.col}:${index}`}
                      className="border border-foreground/10 p-3 font-sans text-xs text-foreground/65"
                    >
                      <span className="mr-2 font-mono text-destructive">
                        L{diagnostic.line}:{diagnostic.col}
                      </span>
                      {diagnostic.message}
                    </div>
                  ))}
                </div>
              )}
              {state.actions.length > 0 && (
                <ActionList actions={state.actions} />
              )}
            </div>
          )}

          {state.status === "ready" && (
            <div className="flex flex-col gap-3">
              <div className="border border-primary/40 bg-primary/5.5 p-3">
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="size-7 text-primary" />
                  <div>
                    <p className="font-sans text-sm font-semibold text-primary">
                      Simulation passed
                    </p>
                    <p className="font-sans text-xs text-foreground/50">
                      Every action below ran on a simulated copy of the chain —
                      nothing real moved.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 border border-foreground/10 bg-foreground/2.5">
                <div className="border-r border-foreground/10 p-3">
                  <p className="font-sans text-[10px] uppercase tracking-wide text-foreground/35">
                    {multiChain ? "Networks" : "Network"}
                  </p>
                  <p className="mt-1 truncate font-sans text-xs">
                    {networkLabel}
                  </p>
                </div>
                <div className="border-r border-foreground/10 p-3">
                  <p className="font-sans text-[10px] uppercase tracking-wide text-foreground/35">
                    From
                  </p>
                  <p className="mt-1 truncate font-mono text-xs">
                    {shortAddress(address)}
                  </p>
                </div>
                <div className="p-3">
                  <p className="font-sans text-[10px] uppercase tracking-wide text-foreground/35">
                    Total
                  </p>
                  <p className="mt-1 font-sans text-xs">
                    {actionCount} action{actionCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <ActionList actions={state.actions} />

              <details
                className="group border border-foreground/10"
                open={executionPhase !== "idle"}
              >
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 font-sans text-xs text-foreground/55">
                  Activity
                  <ChevronDownIcon className="size-4 group-open:rotate-180" />
                </summary>
                {activity(state.actions)}
              </details>
            </div>
          )}

          {current && (state.status === "idle" || state.status === "valid") && (
            <div className="flex min-h-40 flex-col items-center justify-center gap-4 text-center">
              <p className="max-w-xs font-sans text-sm text-foreground/60">
                Check and run the script on a simulated copy of the chain before
                your wallet is asked to sign anything.
              </p>
              {review.unreviewed && (
                <p className="max-w-xs font-sans text-xs text-foreground/60">
                  {SIMULATING_RUNS}
                </p>
              )}
              <Button
                type="button"
                className="min-h-12 font-sans shadow-none"
                onClick={() => void review.simulate()}
              >
                Check & simulate
              </Button>
            </div>
          )}
          {executionPhase !== "idle" &&
            state.status !== "ready" &&
            activity(executed.map(({ action }) => action))}
        </div>

        <Drawer.Footer className="mobile-safe-bottom border-t border-foreground/10 bg-background/95 px-4 pb-3 pt-3">
          {review.unreviewed && !inFlight ? (
            <p className="font-sans text-xs text-foreground/60">
              Approve the changes above before your wallet is asked for
              anything.
            </p>
          ) : state.status === "ready" ? (
            !address ? (
              <Button
                type="button"
                className="min-h-12 font-sans shadow-none"
                onClick={onConnect}
              >
                Connect wallet to continue
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-12 font-sans shadow-none"
                disabled={busy || !review.canExecute}
                onClick={() => onExecute(review.text)}
              >
                {executionPhase === "awaiting-wallet"
                  ? "Confirm in your wallet…"
                  : executionPhase === "watching"
                    ? `Following ${followingBoxes} status box${followingBoxes === 1 ? "" : "es"}`
                    : `Confirm ${actionCount} action${actionCount === 1 ? "" : "s"} in wallet`}
              </Button>
            )
          ) : state.status === "error" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-12 font-sans shadow-none"
              onClick={() => void review.simulate()}
            >
              Run the simulation again
            </Button>
          ) : null}
          {/* Whatever the review shows (its simulation is dropped when the
              script changes), a run in flight keeps its cancel control.
              Cancel in the watching phase only stops following: it never
              touches what was already sent. */}
          {executionPhase === "paused" && heldRun}
          {inFlight && (
            <Button
              type="button"
              variant="outline"
              className="min-h-12 font-sans shadow-none"
              onClick={onCancel}
            >
              {executionPhase === "watching"
                ? "Stop following"
                : "Cancel execution"}
            </Button>
          )}
          {!busy &&
            !review.unreviewed &&
            (state.status !== "ready" || !address) && (
              <Button
                type="button"
                variant="outline"
                className="min-h-12 font-sans shadow-none"
                onClick={() => onExecute(review.text)}
              >
                Run script without simulation
              </Button>
            )}
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  );
}
