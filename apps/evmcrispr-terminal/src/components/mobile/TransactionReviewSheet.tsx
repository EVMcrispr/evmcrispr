import type { Action, TransactionAction } from "@evmcrispr/sdk";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, Drawer, IconButton } from "@repo/ui";
import { type Chain, formatEther } from "viem";
import * as viemChains from "viem/chains";
import type { ExecutionPhase } from "../../hooks/useTransactionExecutor";
import type { TransactionReviewState } from "../../hooks/useTransactionReview";

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
  "awaiting-wallet": {
    title: "Check your wallet",
    description: "Review the wallet prompt and provide final approval.",
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

function ActivityPanel({
  phase,
  logs,
  errors,
  executed,
  rawActions,
}: {
  phase: ExecutionPhase;
  logs: string[];
  errors: string[];
  executed: { action: Action; result?: unknown }[];
  rawActions: unknown;
}) {
  const copy = PHASE_COPY[phase];

  return (
    <div className="flex flex-col gap-3 border-t border-foreground/10 p-3">
      <section
        className={`border p-3 ${
          phase === "error" || phase === "cancelled"
            ? "border-destructive/45 bg-destructive/[0.05]"
            : "border-primary/35 bg-primary/[0.04]"
        }`}
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          {phase === "error" || phase === "cancelled" ? (
            <ExclamationTriangleIcon className="size-5 shrink-0 text-destructive" />
          ) : (
            <CheckCircleIcon className="size-5 shrink-0 text-primary" />
          )}
          <div>
            <h3 className="font-sans text-xs font-semibold">{copy.title}</h3>
            <p className="mt-0.5 font-sans text-xs leading-relaxed text-foreground/55">
              {copy.description}
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

      {(logs.length > 0 || errors.length > 0) && (
        <section>
          <h3 className="mb-2 font-sans text-[10px] uppercase tracking-wider text-foreground/40">
            Console
          </h3>
          <div className="max-h-60 overflow-auto border border-foreground/10 bg-black/55 p-3 font-mono text-[11px] leading-relaxed">
            {logs.map((log, index) => (
              <p key={`log-${index}`} className="text-foreground/65">
                {log}
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

function shortAddress(value: string | undefined) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Created contract";
}

function chainLabel(chainId: number): string {
  const chain = Object.values(viemChains).find(
    (c) => (c as Chain).id === chainId,
  ) as Chain | undefined;
  return chain?.name ?? `Chain ${chainId}`;
}

function flattenActions(actions: Action[]): Action[] {
  return actions.flatMap((action) =>
    "type" in action && action.type === "batched" ? action.actions : [action],
  );
}

function actionChainId(action: Action): number | undefined {
  if (!("type" in action)) return (action as TransactionAction).chainId;
  if (action.type === "batched") return action.chainId;
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

function actionSummary(action: Action) {
  if (!("type" in action)) {
    const transaction = action as TransactionAction;
    const selector = transaction.data?.slice(0, 10);
    const isTransfer = !transaction.data || transaction.data === "0x";
    const isDeployment = !transaction.to;
    return {
      title: isDeployment
        ? "Contract deployment"
        : isTransfer
          ? "Native transfer"
          : "Contract call",
      detail: isDeployment
        ? "Creates a new contract"
        : shortAddress(transaction.to),
      meta:
        transaction.value && transaction.value > 0n
          ? `${formatEther(transaction.value)} ETH`
          : isDeployment
            ? "Deploy"
            : selector && selector !== "0x"
              ? selector
              : "No value",
      warning:
        selector === "0x095ea7b3" &&
        transaction.data?.toLowerCase().includes("ffffffffffffffff")
          ? "This approval may grant unlimited token spending."
          : undefined,
    };
  }

  if (action.type === "wallet") {
    if (action.method === "wallet_switchEthereumChain") {
      const target = (action.params as { chainId?: string | number }[])?.[0]
        ?.chainId;
      const chainId = Number(target);
      return {
        title: "Switch network",
        detail: Number.isInteger(chainId)
          ? chainLabel(chainId)
          : String(target),
        meta: "Wallet prompt",
      };
    }
    return {
      title: "Wallet request",
      detail: action.method,
      meta: `${action.params.length} parameter(s)`,
    };
  }
  if (action.type === "rpc") {
    return {
      title: "RPC request",
      detail: action.method,
      meta: "Network operation",
    };
  }
  if (action.type === "terminal") {
    return {
      title: "Terminal action",
      detail: action.command,
      meta: "Local operation",
    };
  }
  return {
    title: "Transaction batch",
    detail: `${action.actions.length} calls`,
    meta: `Chain ${action.chainId}`,
  };
}

export function TransactionReviewSheet({
  open,
  onOpenChange,
  state,
  actionCount,
  chainName,
  address,
  executionPhase,
  canExecute,
  onPrepare,
  onExecute,
  onConnect,
  logs,
  errors,
  executed,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: TransactionReviewState;
  actionCount: number;
  chainName: string | undefined;
  address: `0x${string}` | undefined;
  executionPhase: ExecutionPhase;
  canExecute: boolean;
  onPrepare: () => void;
  onExecute: () => void;
  onConnect: () => void;
  logs: string[];
  errors: string[];
  executed: { action: Action; result?: unknown }[];
  onCancel: () => void;
}) {
  const busy =
    state.status === "validating" ||
    state.status === "simulating" ||
    executionPhase === "preparing" ||
    executionPhase === "awaiting-wallet";
  const actions = state.status === "ready" ? flattenActions(state.actions) : [];
  const chainIds = targetChainIds(actions);
  const multiChain = chainIds.length > 1;
  const networkLabel =
    chainIds.length === 0
      ? (chainName ?? "From script")
      : multiChain
        ? `${chainIds.length} networks`
        : chainLabel(chainIds[0]);

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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
              <div className="border border-destructive/45 bg-destructive/[0.06] p-4">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="size-6 shrink-0 text-destructive" />
                  <div>
                    <p className="font-sans text-sm font-semibold">
                      Review blocked
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
            </div>
          )}

          {state.status === "ready" && (
            <div className="flex flex-col gap-3">
              <div className="border border-primary/40 bg-primary/[0.055] p-3">
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

              <div className="grid grid-cols-3 border border-foreground/10 bg-foreground/[0.025]">
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

              {actions.map((action, index) => {
                const summary = actionSummary(action);
                const chainId = actionChainId(action);
                return (
                  <article
                    key={`${summary.detail}:${index}`}
                    className="border border-foreground/[0.12] bg-foreground/[0.025] p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/45 font-mono text-xs text-primary">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-sm font-semibold">
                          {summary.title}
                        </p>
                        <p className="truncate font-mono text-[11px] text-foreground/45">
                          {summary.detail}
                          {multiChain && chainId !== undefined && (
                            <span className="ml-2 text-foreground/60">
                              · {chainLabel(chainId)}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="max-w-24 truncate text-right font-mono text-xs text-foreground/65">
                        {summary.meta}
                      </span>
                    </div>
                    {summary.warning && (
                      <div className="mt-3 flex gap-2 border border-evm-yellow-300/35 bg-evm-yellow-300/[0.04] p-2 font-sans text-[11px] text-evm-yellow-300">
                        <ExclamationTriangleIcon className="size-4 shrink-0" />
                        {summary.warning}
                      </div>
                    )}
                  </article>
                );
              })}

              <details
                className="group border border-foreground/10"
                open={executionPhase !== "idle"}
              >
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 font-sans text-xs text-foreground/55">
                  Activity
                  <ChevronDownIcon className="size-4 group-open:rotate-180" />
                </summary>
                <ActivityPanel
                  phase={executionPhase}
                  logs={logs}
                  errors={errors}
                  executed={executed}
                  rawActions={state.actions}
                />
              </details>
            </div>
          )}

          {(state.status === "idle" || state.status === "valid") && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
              <p className="max-w-xs font-sans text-sm text-foreground/60">
                Check and run the script on a simulated copy of the chain before
                your wallet is asked to sign anything.
              </p>
              <Button
                type="button"
                className="min-h-12 font-sans shadow-none"
                onClick={onPrepare}
              >
                Check & simulate
              </Button>
            </div>
          )}
        </div>

        <Drawer.Footer className="mobile-safe-bottom border-t border-foreground/10 bg-background/95 px-4 pb-3 pt-3">
          {state.status === "ready" ? (
            <>
              {!address ? (
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
                  disabled={busy || !canExecute}
                  onClick={onExecute}
                >
                  {executionPhase === "awaiting-wallet"
                    ? "Confirm in your wallet…"
                    : `Confirm ${actionCount} action${actionCount === 1 ? "" : "s"} in wallet`}
                </Button>
              )}
              {(executionPhase === "preparing" ||
                executionPhase === "awaiting-wallet") && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 font-sans shadow-none"
                  onClick={onCancel}
                >
                  Cancel execution
                </Button>
              )}
            </>
          ) : state.status === "error" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-12 font-sans shadow-none"
              onClick={onPrepare}
            >
              Run the simulation again
            </Button>
          ) : null}
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  );
}
