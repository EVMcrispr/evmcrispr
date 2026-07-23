import type {
  Action,
  BatchedAction,
  RpcAction,
  TerminalAction,
  TransactionAction,
  WalletAction,
} from "@evmcrispr/sdk";
import { HaltExecution, isTransactionAction } from "@evmcrispr/sdk";
import type { Address, Chain, Hash, PublicClient, WalletClient } from "viem";
import * as viemChains from "viem/chains";
import { mainnet } from "viem/chains";

import { Interpreter } from "../interpreter/Interpreter";
import { parseScript } from "../parsers/script";
import {
  clientForChain,
  collectPreparedSwitchTargets,
  switchArgForChainId,
} from "../scriptWalk";
import type { ModuleRegistry } from "./registry";
import type { EvmlConfig } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Runs the interpretation half of `executeScript`, feeding each resolved
 * action to `dispatch` and awaiting its result. The default runner uses a
 * local `Interpreter`; a worker-backed runner can interpret elsewhere and
 * proxy actions/logs across, as long as it honors the same contract.
 */
export type InterpretRunner = (
  source: string,
  dispatch: (action: Action) => Promise<unknown>,
  hooks: {
    /** Sender account resolved from the config or wallet. */
    account?: Address;
    /** Feed script log output into the execution's log stream. */
    onLog(message: string): void;
    /** Feed line progress to the config's line listener. */
    onLine(line: number | null): void;
    signal?: AbortSignal;
  },
) => Promise<void>;

export interface ExecuteOptions {
  /** Client used for calls/receipts on the current chain. Defaults to a
   *  client derived from the config's transports per action chainId. */
  publicClient?: PublicClient;
  signal?: AbortSignal;
  /** Advanced: replace the local interpretation step (e.g. run it in a
   *  Web Worker). Action handling stays on the caller's side. */
  interpretRunner?: InterpretRunner;
  /** Status updates (":success:...", ":waiting:..." conventions). Defaults
   *  to the interpreter's log stream (i.e. the tag's `onLog`). */
  onLog?: (message: string) => void;
  /** Use a maximum gas limit when the action doesn't specify one. */
  maximizeGasLimit?: boolean;
  /** Align the wallet with the chains the script switches to before
   *  interpreting (default true). */
  prepareChains?: boolean;
  /** Per-action-type overrides. `ctx.next(action)` delegates back to the
   *  built-in behavior — e.g. a Safe batch handler can fall through for
   *  the non-Safe case. */
  handlers?: Partial<ActionHandlers>;
}

export interface ActionHandlerCtx {
  walletClient: WalletClient;
  getPublicClient(chainId?: number): PublicClient;
  onLog(message: string): void;
  signal?: AbortSignal;
  /** Delegate to the built-in handler for this action. */
  next(action: Action): Promise<unknown>;
}

export type ActionHandlers = {
  transaction(
    action: TransactionAction,
    ctx: ActionHandlerCtx,
  ): Promise<unknown>;
  batched(action: BatchedAction, ctx: ActionHandlerCtx): Promise<unknown>;
  wallet(action: WalletAction, ctx: ActionHandlerCtx): Promise<unknown>;
  rpc(action: RpcAction, ctx: ActionHandlerCtx): Promise<unknown>;
  terminal(action: TerminalAction, ctx: ActionHandlerCtx): Promise<unknown>;
};

export interface ExecutionResult {
  executed: { action: Action; result?: unknown }[];
  /** True when the script stopped via the `halt` command — a clean stop,
   *  not an error. */
  halted: boolean;
  logs: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Abort-aware sleep for real-time `wait` terminal actions. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Execution cancelled"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Execution cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function chainForId(chainId: number): Chain | undefined {
  return Object.values(viemChains).find((c) => (c as Chain).id === chainId) as
    | Chain
    | undefined;
}

export async function switchOrAddChain(
  walletClient: WalletClient,
  chainId: number,
): Promise<void> {
  const currentChainId = await walletClient.getChainId();
  if (currentChainId === chainId) return;

  try {
    await walletClient.switchChain({ id: chainId });
  } catch (_e: any) {
    const newChain = chainForId(chainId);
    if (newChain) {
      try {
        await walletClient.addChain({ chain: newChain });
        await walletClient.switchChain({ id: chainId });
      } catch (addError) {
        console.error("Failed to add or switch chain:", addError);
        throw new Error(
          `Failed to switch to chain ${chainId}. Please add it manually.`,
        );
      }
    } else {
      throw new Error(`Chain with id ${chainId} not configured.`);
    }
  }
}

function uniqueInOrder(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * Walk every command in the script and align the wallet to the chains
 * the script will need: switch through each `switch` target in order and
 * end on the script's start chain. Surfaces a single actionable error
 * when the wallet can't reach a required chain (Safe pinned to one
 * chain, restricted WalletConnect peer, ...).
 */
export async function prepareChainsForScript(
  walletClient: WalletClient,
  script: string,
): Promise<void> {
  let ast;
  try {
    ast = parseScript(script).ast;
  } catch {
    return;
  }

  const firstTopLevel = ast.body[0];
  const allCommands = ast.getAllCommandsUntilLine(Number.POSITIVE_INFINITY);

  const { orderedSwitchChainIds, leadingSwitchChainId } =
    collectPreparedSwitchTargets(allCommands, firstTopLevel);
  const switchChainIds = uniqueInOrder(orderedSwitchChainIds);

  const firstSwitchChainId = leadingSwitchChainId;
  const startChain = firstSwitchChainId ?? mainnet.id;

  const uniqueChains = uniqueInOrder([startChain, ...switchChainIds]);

  let walletChainId = await walletClient.getChainId();

  const ensure = async (chain: number): Promise<void> => {
    if (chain === walletChainId) return;
    try {
      await switchOrAddChain(walletClient, chain);
      walletChainId = chain;
    } catch {
      const walletSwitchArg = switchArgForChainId(walletChainId);
      if (uniqueChains.length === 1 && firstSwitchChainId === undefined) {
        throw new Error(
          `The script should start with \`switch ${walletSwitchArg}\`.`,
        );
      }
      if (uniqueChains.length > 1) {
        throw new Error(`Wallet only supports ${walletSwitchArg}.`);
      }
      // uniqueChains.length === 1 && firstSwitchChainId !== undefined:
      // script explicitly targets a single chain the wallet can't reach.
      throw new Error(
        `Wallet only supports ${walletSwitchArg}, but the script targets ${switchArgForChainId(chain)}.`,
      );
    }
  };

  for (const chain of switchChainIds) {
    await ensure(chain);
  }

  await ensure(startChain);
}

// ---------------------------------------------------------------------------
// Transaction observation (foreign-signer transactions)
// ---------------------------------------------------------------------------

export interface ObserveTransactionParams {
  to: Address;
  data?: `0x${string}`;
  from: Address;
  publicClient: PublicClient;
  onStatusUpdate?: (message: string) => void;
  signal?: AbortSignal;
  /** Polling interval in milliseconds (default: 3000) */
  pollingInterval?: number;
  /** Number of past blocks to check on start (default: 10) */
  lookbackBlocks?: number;
}

export interface ObserveTransactionResult {
  hash: Hash;
  blockNumber: bigint;
}

async function checkBlockForTransaction(
  publicClient: PublicClient,
  blockNumber: bigint,
  expectedFrom: Address,
  expectedTo: Address,
  expectedData: `0x${string}` | undefined,
): Promise<ObserveTransactionResult | null> {
  try {
    const block = await publicClient.getBlock({
      blockNumber,
      includeTransactions: true,
    });

    for (const tx of block.transactions) {
      if (typeof tx === "string") continue;

      if (
        tx.from.toLowerCase() === expectedFrom.toLowerCase() &&
        tx.to?.toLowerCase() === expectedTo.toLowerCase() &&
        tx.input.toLowerCase() === (expectedData ?? "0x").toLowerCase()
      ) {
        return {
          hash: tx.hash,
          blockNumber: tx.blockNumber!,
        };
      }
    }
  } catch (error) {
    // Block might not exist yet or other error - ignore and continue polling
    console.debug(`Error checking block ${blockNumber}:`, error);
  }

  return null;
}

/**
 * Observe the chain for a matching transaction from another signer:
 * check recent blocks first, then poll new blocks until found or aborted.
 */
export async function observeTransaction(
  params: ObserveTransactionParams,
): Promise<ObserveTransactionResult> {
  const {
    to,
    data,
    from,
    publicClient,
    onStatusUpdate,
    signal,
    pollingInterval = 3000,
    lookbackBlocks = 10,
  } = params;

  const formattedFrom = truncateAddress(from);

  onStatusUpdate?.(
    `:waiting: Waiting for ${formattedFrom} to execute transaction...`,
  );

  if (signal?.aborted) {
    throw new Error("Observation cancelled");
  }

  // First, check recent blocks in case transaction was already executed
  const currentBlock = await publicClient.getBlockNumber();
  const startBlock =
    currentBlock > BigInt(lookbackBlocks)
      ? currentBlock - BigInt(lookbackBlocks)
      : 0n;

  for (let blockNum = startBlock; blockNum <= currentBlock; blockNum++) {
    if (signal?.aborted) {
      throw new Error("Observation cancelled");
    }

    const result = await checkBlockForTransaction(
      publicClient,
      blockNum,
      from,
      to,
      data,
    );

    if (result) {
      onStatusUpdate?.(
        `:success: Transaction from ${formattedFrom} confirmed in block ${result.blockNumber}`,
      );
      return result;
    }
  }

  // If not found in recent blocks, start watching for new blocks
  let lastCheckedBlock = currentBlock;

  return new Promise((resolve, reject) => {
    const abortHandler = () => {
      clearInterval(pollInterval);
      reject(new Error("Observation cancelled"));
    };

    signal?.addEventListener("abort", abortHandler);

    const pollInterval = setInterval(async () => {
      try {
        const latestBlock = await publicClient.getBlockNumber();

        for (
          let blockNum = lastCheckedBlock + 1n;
          blockNum <= latestBlock;
          blockNum++
        ) {
          if (signal?.aborted) {
            clearInterval(pollInterval);
            signal?.removeEventListener("abort", abortHandler);
            reject(new Error("Observation cancelled"));
            return;
          }

          const result = await checkBlockForTransaction(
            publicClient,
            blockNum,
            from,
            to,
            data,
          );

          if (result) {
            clearInterval(pollInterval);
            signal?.removeEventListener("abort", abortHandler);
            onStatusUpdate?.(
              `:success: Transaction from ${formattedFrom} confirmed in block ${result.blockNumber}`,
            );
            resolve(result);
            return;
          }
        }

        lastCheckedBlock = latestBlock;
      } catch (error) {
        // Log error but continue polling - network issues shouldn't stop
        // observation
        console.error("Error during transaction observation:", error);
      }
    }, pollingInterval);
  });
}

// ---------------------------------------------------------------------------
// Built-in action handlers
// ---------------------------------------------------------------------------

export interface ExecutorEnv {
  account: Address | undefined;
  maximizeGasLimit: boolean;
}

export function makeDefaultHandlers(env: ExecutorEnv): ActionHandlers {
  return {
    async transaction(action, ctx) {
      const publicClient = ctx.getPublicClient(action.chainId);

      if (action.readOnly) {
        if (!action.to) {
          throw new Error(
            "Read-only assertion action is missing a target address",
          );
        }
        ctx.onLog(`Checking assertion at ${truncateAddress(action.to)}`);
        try {
          await publicClient.call({
            to: action.to,
            data: action.data,
            ...(action.from ? { account: action.from } : {}),
            ...(action.value !== undefined ? { value: action.value } : {}),
          });
        } catch (err: any) {
          const reason =
            err?.shortMessage ?? err?.details ?? err?.message ?? String(err);
          throw new Error(`Assertion failed: ${reason}`);
        }
        ctx.onLog(":success:Assertion passed");
        return;
      }

      const actionFrom = action.from?.toLowerCase();
      const isOurTransaction =
        !actionFrom ||
        (env.account && actionFrom === env.account.toLowerCase());

      if (isOurTransaction) {
        ctx.onLog(
          action.to
            ? `Sending transaction to ${truncateAddress(action.to)}`
            : "Sending contract deployment transaction",
        );

        if (action.chainId === undefined) {
          throw new Error(
            `Transaction to ${action.to ?? "<deploy>"} is missing chainId`,
          );
        }
        const chainId = action.chainId;

        let gasLimit: bigint | undefined = action.gas;
        if (!gasLimit && env.maximizeGasLimit) {
          gasLimit = 16_777_216n;
        }

        const tx = await ctx.walletClient.sendTransaction({
          account: ctx.walletClient.account ?? action.from!,
          chain: chainForId(chainId) ?? null,
          to: action.to,
          data: action.data,
          value: action.value,
          gas: gasLimit,
          maxFeePerGas: action.maxFeePerGas,
          maxPriorityFeePerGas: action.maxPriorityFeePerGas,
          nonce: action.nonce,
        });
        const receipt = await ctx
          .getPublicClient(chainId)
          .waitForTransactionReceipt({ hash: tx });
        ctx.onLog(
          `:success:Transaction confirmed: [${tx.slice(0, 10)}...](${tx})`,
        );
        return receipt;
      }

      if (!action.to) {
        throw new Error(
          "Cannot observe contract deployment transactions from other signers",
        );
      }
      ctx.onLog(
        `:waiting:Waiting for ${truncateAddress(action.from!)} to execute transaction to ${truncateAddress(action.to)}`,
      );
      return observeTransaction({
        to: action.to,
        data: action.data,
        from: action.from!,
        publicClient,
        onStatusUpdate: ctx.onLog,
        signal: ctx.signal,
      });
    },

    async batched(action, ctx) {
      const { actions, chainId } = action;
      if (actions.length === 0) return;

      if (
        actions.find((a) => a.chainId !== undefined && a.chainId !== chainId)
      ) {
        throw new Error("Batch contains transactions for multiple chains");
      }

      ctx.onLog(
        `Executing batch of ${actions.length} transactions from ${truncateAddress(action.from)}`,
      );

      const chain = chainForId(chainId);
      if (chain) {
        await ctx.walletClient.switchChain({ id: chainId });
      }

      // Contract deployments (no 'to' address) cannot be batched — fail
      // loudly instead of silently dropping them from the batch.
      if (actions.some((a) => a.to === undefined)) {
        throw new Error(
          "Contract deployments (no target address) cannot be executed in a batch",
        );
      }

      const { id } = await ctx.walletClient.sendCalls({
        account: ctx.walletClient.account ?? action.from,
        chain: chain,
        forceAtomic: true,
        calls: actions.map((a) => ({
          to: a.to!,
          data: a.data,
          value: BigInt(a.value || "0"),
        })),
      });

      const result = await ctx.walletClient.waitForCallsStatus({ id });
      if (result.status !== "success") {
        throw new Error(
          `Transaction batch failed on ${chain?.name || "unknown chain"}`,
        );
      }

      // Aggregate logs from all receipts for event capture support.
      if (result.receipts && result.receipts.length > 0) {
        const allLogs = result.receipts.flatMap((r) => r.logs);
        return { logs: allLogs };
      }

      // Wallet executed the batch but didn't return receipts (EIP-5792
      // receipts are optional). Without logs, event captures cannot be
      // resolved, so fail explicitly rather than letting downstream code
      // silently receive undefined.
      throw new Error(
        "Wallet did not return transaction receipts for the batch — event capture requires receipt logs",
      );
    },

    async wallet(action, ctx) {
      if (action.method === "wallet_switchEthereumChain") {
        const chainId = Number((action.params[0] as any).chainId);
        await switchOrAddChain(ctx.walletClient, chainId);
        return;
      }
      return ctx.walletClient.request({
        method: action.method as any,
        params: action.params as any,
      });
    },

    async rpc(action, ctx) {
      ctx.onLog(`RPC call: ${action.method}`);
      return ctx.getPublicClient().request({
        method: action.method as any,
        params: action.params as any,
      });
    },

    async terminal(action, ctx) {
      if (action.command === "halt") {
        throw new HaltExecution();
      }
      if (action.command === "wait") {
        const seconds = Number(action.args.seconds ?? 0);
        ctx.onLog(`Waiting ${seconds}s before the next action`);
        await sleep(seconds * 1000, ctx.signal);
        return;
      }
      ctx.onLog(
        `Terminal action: ${action.command} ${JSON.stringify(action.args)}`,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Script execution entry point
// ---------------------------------------------------------------------------

/**
 * Interpret `source` and execute every produced action with
 * `walletClient`. Dispatch per action type is built in; override any of
 * them via `options.handlers` (with `ctx.next(action)` delegating back).
 */
export async function executeScript(
  source: string,
  registry: ModuleRegistry,
  config: EvmlConfig,
  walletClient: WalletClient,
  options: ExecuteOptions = {},
): Promise<ExecutionResult> {
  const logs: string[] = [];
  const executed: { action: Action; result?: unknown }[] = [];

  const account =
    config.account ?? (walletClient.account?.address as Address | undefined);

  const interpreter = new Interpreter(registry, { ...config, account });
  interpreter.registerLogListener((message) => {
    logs.push(message);
  });

  const onLog =
    options.onLog ?? ((message: string) => interpreter.log(message));

  const getPublicClient = (chainId?: number): PublicClient => {
    if (chainId !== undefined) {
      const client = clientForChain(chainId, config.transports);
      if (client) return client;
    }
    if (options.publicClient) return options.publicClient;
    const fallback = clientForChain(
      config.chainId ?? mainnet.id,
      config.transports,
    );
    if (!fallback) throw new Error("No public client available");
    return fallback;
  };

  const defaults = makeDefaultHandlers({
    account,
    maximizeGasLimit: options.maximizeGasLimit ?? false,
  });

  const runDefault = (action: Action, ctx: ActionHandlerCtx) => {
    if (isTransactionAction(action)) return defaults.transaction(action, ctx);
    switch (action.type) {
      case "batched":
        return defaults.batched(action, ctx);
      case "wallet":
        return defaults.wallet(action, ctx);
      case "rpc":
        return defaults.rpc(action, ctx);
      case "terminal":
        return defaults.terminal(action, ctx);
    }
  };

  const ctx: ActionHandlerCtx = {
    walletClient,
    getPublicClient,
    onLog,
    signal: options.signal,
    next: (action) => runDefault(action, ctx),
  };

  const dispatch = async (action: Action): Promise<unknown> => {
    if (options.signal?.aborted) {
      throw new Error("Execution cancelled");
    }
    const handlers = options.handlers;
    let result: unknown;
    if (handlers && isTransactionAction(action) && handlers.transaction) {
      result = await handlers.transaction(action, ctx);
    } else if (
      handlers &&
      !isTransactionAction(action) &&
      handlers[action.type]
    ) {
      result = await (handlers[action.type] as any)(action, ctx);
    } else {
      result = await runDefault(action, ctx);
    }
    executed.push({ action, result });
    return result;
  };

  if (options.prepareChains ?? true) {
    await prepareChainsForScript(walletClient, source);
  }

  const runInterpret: InterpretRunner =
    options.interpretRunner ??
    (async (src, dispatchFn, hooks) => {
      await interpreter.interpret(src, dispatchFn, { signal: hooks.signal });
    });

  try {
    await runInterpret(source, dispatch, {
      account,
      onLog: (message) => interpreter.log(message),
      onLine: (line) => config.onLine?.(line),
      signal: options.signal,
    });
    return { executed, halted: false, logs };
  } catch (err) {
    if (err instanceof HaltExecution) {
      return { executed, halted: true, logs };
    }
    throw err;
  }
}
