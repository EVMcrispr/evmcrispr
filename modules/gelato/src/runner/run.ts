import { createEvml, ModuleRegistry } from "@evmcrispr/core";
import { moduleEntries } from "@evmcrispr/modules";
import type { Action, Address } from "@evmcrispr/sdk";
import { ExitSignal } from "@evmcrispr/sdk";
import type { Transport } from "viem";
import { custom, http } from "viem";
import { actionsToCalls } from "./calls";
import type { RunContext, RunResult, Send } from "./protocol";
import { RUNNER_EXCLUDED_MODULES, type RunnerUserArgs } from "./schema";

const excluded = new Set<string>(RUNNER_EXCLUDED_MODULES);
// The runner's own registry, so what a script can `load` is exactly what
// the bundle ships. Every module in it is available: gating experimental
// ones is a terminal concern, decided when the runner is published.
const evml = createEvml({}, new ModuleRegistry());
evml.use(
  ...moduleEntries
    .filter((m) => !excluded.has(m.name))
    .map(({ name, load }) => ({ name, load })),
);

/** JSON-RPC error viem understands (ethers v5 nests the node's error). */
function toRpcError(err: unknown): Error {
  const e = err as {
    message?: string;
    code?: unknown;
    data?: unknown;
    error?: { message?: string; code?: unknown; data?: unknown };
  };
  const inner = e.error ?? e;
  const out = new Error(inner.message ?? e.message ?? String(err)) as Error & {
    code?: unknown;
    data?: unknown;
  };
  if (inner.code !== undefined) out.code = inner.code;
  if (inner.data !== undefined) out.data = inner.data;
  return out;
}

/**
 * The transport the script reads through: the user's own RPC when the task
 * names one (plain fetch, outside Gelato's RPC quota), else Gelato's
 * provider. `eth_chainId` is answered locally either way: the interpreter
 * asks once per command and the answer is known.
 */
export function runnerTransport(
  chainId: number,
  rpcUrl: string,
  send: Send,
): Transport {
  if (rpcUrl) return http(rpcUrl);
  return custom({
    async request({ method, params }) {
      if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
      try {
        return await send(method, (params ?? []) as unknown[]);
      } catch (err) {
        throw toRpcError(err);
      }
    },
  });
}

export interface RunnerContext extends Omit<RunContext, "userArgs"> {
  userArgs: RunnerUserArgs;
}

/** Interpret the task's script and return the calls it produced. */
export async function run(ctx: RunnerContext): Promise<RunResult> {
  const { script, account, sender, rpcUrl } = ctx.userArgs;
  const chainId = ctx.gelatoArgs.chainId;
  // `@me` is the task creator's wallet, as when the script was written;
  // `@sender` the dedicated msg.sender the calls come from.
  const executor = sender as Address;
  const transport = runnerTransport(chainId, rpcUrl, (method, params) =>
    ctx.multiChainProvider.chainId(chainId).send(method, params),
  );
  const actions: Action[] = [];
  try {
    await evml
      .with({
        account: account as Address,
        sender: executor,
        chainId,
        transports: { [chainId]: transport },
      })
      .script(script)
      .interpret({
        onAction: async (action) => {
          actions.push(action);
        },
      });
  } catch (err) {
    if (!(err instanceof ExitSignal)) {
      return { canExec: false, message: (err as Error).message };
    }
  }
  try {
    const callData = actionsToCalls(actions, executor);
    if (callData.length === 0) {
      return { canExec: false, message: "the script produced no calls" };
    }
    return { canExec: true, callData };
  } catch (err) {
    return { canExec: false, message: (err as Error).message };
  }
}
