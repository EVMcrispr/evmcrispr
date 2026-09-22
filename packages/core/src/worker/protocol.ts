import type { Action, DeclaredErrorFieldValue } from "@evmcrispr/sdk";
import {
  DeclaredError,
  ErrorException,
  ExitSignal,
  MAX_CAUSE_DEPTH,
  RevertError,
} from "@evmcrispr/sdk";
import type { Address } from "viem";

import type { SimulateOptions } from "../evml/simulate";

/**
 * Structured-clone-safe subset of `EvmlConfig`: transports become plain
 * RPC URLs, callbacks become `log`/`line` protocol events.
 */
export interface WorkerEvmlConfig {
  stdin?: string;
  account?: Address;
  sender?: Address;
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
  /** `DeclaredError`'s declared shape, when present (`name` is then always
   *  `"DeclaredError"`). `fields` is the same frozen record the error
   *  carries — its values are bigint/string/boolean, all structured-clone
   *  safe, so it travels across `postMessage` unchanged. */
  declared?: {
    errorName: string;
    fields: Readonly<Record<string, DeclaredErrorFieldValue>>;
    revertData: `0x${string}`;
  };
  /** The wrapped error's `cause`, serialized the same way. A location
   *  wrapper (`HelperFunctionError`, `CommandError`) around a declared
   *  refusal carries it here so the leaf can be rehydrated as a real
   *  `DeclaredError` while the wrapper keeps its own name/message. Bounded
   *  to `MAX_CAUSE_DEPTH` links and cycle-guarded; never AST/runtime
   *  object graphs, only name/message/declared-shape per level. */
  cause?: SerializedError;
  /** The level came from an `ErrorException` subclass whose class has no
   *  dedicated branch (`CommandError`, `HelperFunctionError`, `ErrorInvalid`,
   *  …). It rehydrates as an `ErrorException` carrying `name`, so
   *  `instanceof ErrorException` survives the boundary as it did before
   *  subclass names started travelling. */
  exception?: true;
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
  | { kind: "output"; id: string; message: string }
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

/** Serialize one error level, with no `cause` attached yet. `DeclaredError`
 *  is checked before the generic `ErrorException` branch (it extends it),
 *  and before any branch keyed only on `name`/`message`, so its declared
 *  shape is never dropped. */
function serializeErrorLevel(err: unknown): SerializedError {
  if (err instanceof DeclaredError) {
    return {
      name: "DeclaredError",
      message: err.message,
      declared: {
        errorName: err.errorName,
        fields: err.fields,
        revertData: err.revertData,
      },
    };
  }
  if (err instanceof RevertError) {
    return { name: "RevertError", message: err.message, data: err.revertData };
  }
  if (err instanceof ExitSignal) {
    return { name: "ExitSignal", message: err.message };
  }
  if (err instanceof ErrorException) {
    // Keeps the actual display name (e.g. `HelperFunctionError`,
    // `CommandError`) instead of collapsing every subclass to the base
    // `"ErrorException"`, so a wrapper around a declared refusal keeps its
    // own name across the boundary. The `exception` marker keeps the class
    // itself: the level rehydrates as an `ErrorException`, not a plain
    // `Error` wearing the name.
    return { name: err.name, message: err.message, exception: true };
  }
  if (err instanceof Error) {
    return { name: err.name || "Error", message: err.message };
  }
  return { name: "Error", message: String(err) };
}

/** Serialize an error and its `cause` chain for the worker boundary.
 *  Bounded to `MAX_CAUSE_DEPTH` links and cycle-guarded (a `Set` of the
 *  objects already visited), so a malformed or self-referential chain
 *  cannot hang the caller. Only name/message/declared-shape cross; never
 *  AST nodes or other runtime object graphs. */
export function serializeError(
  err: unknown,
  seen: Set<unknown> = new Set(),
  depth = 0,
): SerializedError {
  const serialized = serializeErrorLevel(err);
  if (
    err &&
    typeof err === "object" &&
    depth < MAX_CAUSE_DEPTH - 1 &&
    !seen.has(err)
  ) {
    seen.add(err);
    const cause = (err as { cause?: unknown }).cause;
    if (cause !== undefined) {
      serialized.cause = serializeError(cause, seen, depth + 1);
    }
  }
  return serialized;
}

/** Rehydrate to the matching error class so `instanceof` checks (e.g.
 *  `ExitSignal` in `executeScript`, `DeclaredError` for error captures)
 *  survive the boundary. A `DeclaredError` anywhere in the chain comes
 *  back as a real `DeclaredError` instance; every other level rehydrates
 *  with its outer display name/message and `cause` pointing at the
 *  rehydrated child. */
export function deserializeError(e: SerializedError): Error {
  const cause = e.cause ? deserializeError(e.cause) : undefined;
  const err = ((): Error => {
    switch (e.name) {
      case "DeclaredError": {
        const d = e.declared;
        return d
          ? new DeclaredError(d.errorName, e.message, d.fields, d.revertData)
          : new ErrorException(e.message);
      }
      case "RevertError":
        return new RevertError(e.message, e.data);
      case "ExitSignal":
        return new ExitSignal(e.message);
      case "ErrorException":
        return new ErrorException(e.message);
      default: {
        if (e.exception) {
          // A subclass without its own branch: an `ErrorException` again,
          // keeping the display name it crossed with. The name goes through
          // the constructor — `ErrorException` defines it non-writable.
          return new ErrorException(e.message, { name: e.name });
        }
        const generic = new Error(e.message);
        generic.name = e.name;
        return generic;
      }
    }
  })();
  if (cause !== undefined) err.cause = cause;
  return err;
}
