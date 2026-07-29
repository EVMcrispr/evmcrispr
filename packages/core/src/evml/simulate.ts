import type { Action } from "@evmcrispr/sdk";
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
}

export interface SimulationResult {
  success: boolean;
  /** Log-listener output captured during the run (per-action results). */
  logs: string[];
  /** Actions returned by the interpreter, when the run succeeded. */
  actions: Action[];
  error?: string;
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
  const interpreter = new Interpreter(registry, {
    ...config,
    account: options.from ?? config.account,
  });
  interpreter.registerLogListener((message) => {
    logs.push(message);
  });

  const script = needsSimWrap(source) ? wrapScript(source, options) : source;

  try {
    const actions = await interpreter.interpret(script, undefined, {
      signal: options.signal,
    });
    return { success: true, logs, actions };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, logs, actions: [], error: message };
  }
}
