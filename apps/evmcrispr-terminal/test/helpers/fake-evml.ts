import type { ActionHandlerCtx, ExecuteOptions } from "@evmcrispr/core";
import type {
  WorkerEvml,
  WorkerEvmlClientConfig,
} from "@evmcrispr/core/worker-client";
import type { Action, ActionHoldState, BoxSnapshot } from "@evmcrispr/sdk";
import type { WalletClient } from "viem";

/** What the wallet answers to one request: a result, or an error to throw.
 *  Asked again on every attempt. */
export type WalletAnswer = (
  action: Action,
  attempt: number,
) => Promise<unknown>;

export interface Step {
  line?: number;
  log?: string;
  box?: BoxSnapshot;
  action?: Action;
  /** A change of chain asked before interpreting (chain alignment). */
  chain?: number;
  /** Thrown by the action's handler after the wallet granted its request:
   *  a later step of the same handler failing. */
  failsAfterSend?: unknown;
}

export interface FakeEvml extends WorkerEvml {
  /** The wallet of the test: every request is answered by its script. */
  wallet: WalletClient;
  terminated: boolean;
  /** The script it was last given. */
  source: string;
  /** Statuses the page reported for its actions, in order. */
  statuses: ActionHoldState[];
  /** How many requests reached the wallet. */
  attempts: number;
}

const switchTo = (chainId: number): Action => ({
  type: "wallet",
  method: "wallet_switchEthereumChain",
  params: [{ chainId: `0x${chainId.toString(16)}` }],
});

/** Plays `steps` as a run against the page's handlers, the way the worker
 *  client does. `hold` keeps the run open after the last step (a script
 *  that only follows boxes) until the signal aborts; `resolveOnAbort`
 *  makes that ending a clean one, as the core does for a run cancelled
 *  after its script ended. */
export function fakeEvml(
  steps: Step[],
  wallet: WalletAnswer,
  options: {
    hold?: boolean;
    resolveOnAbort?: boolean;
    simulation?: Partial<{
      success: boolean;
      actions: Action[];
      logs: string[];
      error: string;
    }>;
  } = {},
): FakeEvml {
  const asked = new Map<unknown, number>();
  const answer = (action: Action, key: unknown = action) => {
    const attempt = asked.get(key) ?? 0;
    asked.set(key, attempt + 1);
    fake.attempts++;
    return wallet(action, attempt);
  };
  const fake = {
    wallet: {
      account: undefined,
      chain: undefined,
      request: async ({
        method,
        params,
      }: {
        method: string;
        params: any[];
      }) => {
        if (method === "eth_chainId") return "0x1";
        if (method === "wallet_switchEthereumChain") {
          const id = Number(params[0].chainId);
          return answer(switchTo(id), id);
        }
        return answer(params[0]);
      },
    } as unknown as WalletClient,
    terminated: false,
    source: "",
    statuses: [] as ActionHoldState[],
    attempts: 0,
  } as FakeEvml;
  const make = (config: WorkerEvmlClientConfig): WorkerEvml => ({
    with: (overrides) => make({ ...config, ...overrides }),
    terminate() {
      fake.terminated = true;
    },
    script: (source) => ({
      async simulate() {
        fake.source = source;
        for (const step of steps) if (step.log) config.onLog?.(step.log, []);
        return { success: true, logs: [], actions: [], ...options.simulation };
      },
      async execute(client, execute: ExecuteOptions = {}) {
        // As the core does it: every request goes to the wallet the run
        // was given, never around it.
        const ask = (method: string, param: unknown) =>
          (
            client as unknown as { request(args: unknown): Promise<unknown> }
          ).request({ method, params: [param] });
        fake.source = source;
        const executed: { action: Action; result?: unknown }[] = [];
        const aborted = new Promise<never>((_, reject) =>
          execute.signal?.addEventListener("abort", () =>
            reject(new Error("Execution cancelled")),
          ),
        );
        aborted.catch(() => {});
        for (const step of steps) {
          if (execute.signal?.aborted) throw new Error("Execution cancelled");
          if (step.chain !== undefined) {
            const chain = step.chain;
            const align = async () => {
              await ask("wallet_switchEthereumChain", {
                chainId: `0x${chain.toString(16)}`,
              });
            };
            await (execute.prepareChain?.(chain, align) ?? align());
          }
          if (step.line !== undefined) config.onLine?.(step.line);
          if (step.log) config.onLog?.(step.log, []);
          if (step.box) config.onBox?.(step.box);
          if (!step.action) continue;
          const action = step.action;
          const kind = "type" in action ? action.type : "transaction";
          const ctx = {
            onStatus: (state: ActionHoldState) => fake.statuses.push(state),
            next: async (a: Action) => {
              const result = await ask(
                kind === "batched"
                  ? "wallet_sendCalls"
                  : kind === "wallet"
                    ? "personal_sign"
                    : "eth_sendTransaction",
                a,
              );
              if (step.failsAfterSend) throw step.failsAfterSend;
              return result;
            },
          } as unknown as ActionHandlerCtx;
          const handlers = (execute.handlers ?? {}) as Record<
            string,
            ((a: Action, c: ActionHandlerCtx) => Promise<unknown>) | undefined
          >;
          const handler = handlers[kind];
          const result = await Promise.race([
            handler ? handler(action, ctx) : ctx.next(action),
            aborted,
          ]);
          executed.push({ action, result });
        }
        config.onLine?.(null);
        if (options.hold)
          await aborted.catch((error) => {
            if (!options.resolveOnAbort)
              throw new Error("Observation cancelled", { cause: error });
          });
        return { executed, exited: false, logs: [] };
      },
    }),
  });
  return Object.assign(fake, make({}));
}
