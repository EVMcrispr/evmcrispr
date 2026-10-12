import type { Action, Suggestion } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";

import { Interpreter } from "../interpreter/Interpreter";
import type { ModuleRegistry } from "./registry";
import type { EvmlConfig } from "./types";

export interface SimulateOptions {
  blockNumber?: number;
  from?: Address;
  /** Fork backend passed as `sim:fork --using <backend>`. */
  using?:
    | "anvil"
    | "hardhat"
    | "tenderly"
    | "tenderly-multichain"
    | "ethereumjs"
    | "revm";
  /** Auth token passed as `sim:fork --auth-token <token>` (tenderly). */
  authToken?: string;
  /** Cancels the simulation between actions and aborts fork RPC fetches. */
  signal?: AbortSignal;
  /** Ask for assertions suggested from what the run did. `tolerance` is the
   *  percent of a balance change an amount check allows (default 1);
   *  `executor` is the account whose balances are guarded (default `from`). */
  suggest?: boolean | { tolerance?: number; executor?: Address };
}

export interface SimulationResult {
  success: boolean;
  /** Log-listener output captured during the run (per-action results). */
  logs: string[];
  /** Every action the run dispatched, in execution order. `sim:fork`
   *  consumes its block's actions (and returns none), so these are
   *  observed at dispatch time — they include actions executed on the
   *  fork, each stamped with the chain id it targeted. */
  actions: Action[];
  error?: string;
  /** Suggested `assert` lines, when `suggest` was asked and the run
   *  succeeded. */
  suggestions?: Suggestion[];
  /** The run emitted more than the suggestions looked at: the list may be
   *  missing some. */
  suggestionsTruncated?: true;
}

function needsSimWrap(script: string): boolean {
  const normalized = script.toLowerCase();
  return !(normalized.includes("load sim") && normalized.includes("sim:fork"));
}

function wrapScript(script: string, options: SimulateOptions): string {
  const forkOpts: string[] = [];
  if (options.blockNumber) {
    forkOpts.push(`--block-number ${options.blockNumber}`);
  }
  if (options.from) {
    forkOpts.push(`--from ${options.from}`);
  }
  if (options.using) {
    forkOpts.push(`--using ${options.using}`);
  }
  if (options.authToken) {
    forkOpts.push(`--auth-token ${options.authToken}`);
  }

  const optsStr = forkOpts.length > 0 ? ` ${forkOpts.join(" ")}` : "";
  return `load sim\nsim:fork${optsStr} (\n${script}\n)`;
}

/**
 * Run `source` inside a `sim:fork` fork. Scripts that already fork
 * themselves (`load sim` + `sim:fork`) run unwrapped. Script failures are
 * reported via `{ success: false, error }` — this never throws for them.
 */
export async function simulateScript(
  source: string,
  registry: ModuleRegistry,
  config: EvmlConfig,
  options: SimulateOptions = {},
): Promise<SimulationResult> {
  if (!registry.has("sim")) {
    throw new ErrorException(
      "simulate() needs the sim module: register it with evml.use(sim) " +
        "(import sim from '@evmcrispr/module-sim')",
    );
  }

  const logs: string[] = [];
  const dispatched: Action[] = [];
  const interpreter = new Interpreter(registry, {
    ...config,
    account: options.from ?? config.account,
    onOutput: config.onOutput
      ? (message) => {
          logs.push(message);
          config.onOutput!(message);
        }
      : undefined,
  });
  interpreter.registerLogListener((message) => {
    logs.push(message);
  });
  interpreter.registerActionObserver((action) => {
    dispatched.push(action);
  });

  let suggestions: Suggestion[] | undefined;
  let truncated = false;
  if (options.suggest) {
    const asked = options.suggest === true ? {} : options.suggest;
    // A percentage: anything else would put a floor above the simulated
    // balance, or nowhere.
    const given = asked.tolerance ?? 1;
    const tolerance = Number.isFinite(given)
      ? Math.min(100, Math.max(0, given))
      : 1;
    interpreter.registerSuggestionSink(
      { tolerance, executor: asked.executor },
      (found, info) => {
        suggestions = [...(suggestions ?? []), ...found];
        if (info?.truncated) truncated = true;
      },
    );
  }

  const script = needsSimWrap(source) ? wrapScript(source, options) : source;

  try {
    // Returned actions are only those that escape execution (e.g. produced
    // outside any fork); actions run inside `sim:fork` are captured by the
    // dispatch observer instead.
    const returned = await interpreter.interpret(script, undefined, {
      signal: options.signal,
    });
    return {
      success: true,
      logs,
      actions: [...dispatched, ...returned],
      ...(options.suggest ? { suggestions: suggestions ?? [] } : {}),
      ...(truncated ? { suggestionsTruncated: true as const } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, logs, actions: dispatched, error: message };
  }
}
