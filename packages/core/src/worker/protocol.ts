import type { Action } from "@evmcrispr/sdk";
import { ErrorException, ExitSignal, RevertError } from "@evmcrispr/sdk";
import type { Address } from "viem";

import type { SimulateOptions } from "../evml/simulate";

/**
 * Structured-clone-safe subset of `EvmlConfig`: transports become plain
 * RPC URLs, callbacks become `log`/`line` protocol events.
 */
export interface WorkerEvmlConfig {
  account?: Address;
  chainId?: number;
  /** Per-chain RPC endpoints. Chains without an entry fall back to viem's
   *  default `http()` transport, matching `EvmlConfig.transports`. */
  rpcUrls?: Record<number, string>;
}

export interface SerializedError {
  name: string;
  message: string;
  /** `RevertError`'s revert data, when present. */
  data?: `0x${string}`;
}

/** `SimulateOptions` minus the non-cloneable signal (aborts travel as
 *  `abort` messages instead). */
export type SimulateRequestOptions = Omit<SimulateOptions, "signal">;

export type MainToWorkerMessage =
  | {
      kind: "simulate";
      id: string;
      source: string;
      config: WorkerEvmlConfig;
      options: SimulateRequestOptions;
    }
  | {
      kind: "interpret";
      id: string;
      source: string;
      config: WorkerEvmlConfig;
    }
  | {
      kind: "action-result";
      id: string;
      actionId: number;
      ok: boolean;
      value?: unknown;
      error?: SerializedError;
    }
  | { kind: "abort"; id: string };

export type WorkerToMainMessage =
  | { kind: "ready" }
  | { kind: "log"; id: string; message: string }
  | { kind: "line"; id: string; line: number | null }
  | { kind: "action"; id: string; actionId: number; action: Action }
  | { kind: "result"; id: string; ok: true; value: unknown }
  | { kind: "result"; id: string; ok: false; error: SerializedError };

/** Minimal structural Worker type so the client compiles without DOM libs
 *  (the browser `Worker` satisfies it). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof RevertError) {
    return { name: "RevertError", message: err.message, data: err.revertData };
  }
  if (err instanceof ExitSignal) {
    return { name: "ExitSignal", message: err.message };
  }
  if (err instanceof ErrorException) {
    return { name: "ErrorException", message: err.message };
  }
  if (err instanceof Error) {
    return { name: err.name || "Error", message: err.message };
  }
  return { name: "Error", message: String(err) };
}

/** Rehydrate to the matching error class so `instanceof` checks (e.g.
 *  `ExitSignal` in `executeScript`) survive the boundary. */
export function deserializeError(e: SerializedError): Error {
  switch (e.name) {
    case "RevertError":
      return new RevertError(e.message, e.data);
    case "ExitSignal":
      return new ExitSignal(e.message);
    case "ErrorException":
      return new ErrorException(e.message);
    default: {
      const err = new Error(e.message);
      err.name = e.name;
      return err;
    }
  }
}
