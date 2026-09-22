import type { AbiError } from "abitype";
import { decodeErrorResult } from "viem";

import type { BindingsManager } from "../BindingsManager";
import { RevertError } from "../errors";
import type { ErrorCaptureNode } from "../types";
import { BindingsSpace } from "../types";
import { findDeclaredError, MAX_CAUSE_DEPTH } from "./declaredErrors";
import { applyDestructure } from "./destructure";
import type { ErrorCaptureSources } from "./error-signatures";
import {
  errorSelector,
  PANIC_ABI,
  STANDARD_ERROR_ABI,
  selectCaptureErrorAbis,
} from "./error-signatures";

export type {
  DeclaredErrorEntry,
  DeclaredErrorIndex,
  DeclaredErrorOwnerKind,
  ErrorCaptureSources,
} from "./error-signatures";
export {
  errorAbiFromSignature,
  errorSelector,
  errorSignature,
  indexDeclaredErrors,
  selectCaptureErrorAbis,
} from "./error-signatures";

const { USER } = BindingsSpace;

/** Well-formed ABI error data: a selector, optionally followed by whole
 *  32-byte words. Checked structurally so a `DeclaredError` revived across
 *  the worker boundary is read the same way as a live one — without
 *  trusting an arbitrary `revertData` property to be hex. */
function asRevertData(value: unknown): `0x${string}` | undefined {
  return typeof value === "string" &&
    /^0x([0-9a-fA-F]{2})*$/.test(value) &&
    value.length % 2 === 0
    ? (value as `0x${string}`)
    : undefined;
}

/**
 * Walk a viem / provider error chain looking for raw ABI-encoded revert data.
 *
 * Covers:
 *  - RevertError (our own, thrown by EthereumJS backend and fork command)
 *  - DeclaredError, whose off-chain `revertData` is the ABI encoding of a
 *    declared refusal — carried structurally, so it is *not* a chain failure
 *  - viem BaseError chain (TransactionExecutionError wrapping inner errors)
 *  - Generic errors whose `data` property is a hex string
 *
 * The `cause` walk is depth-bounded and cycle-guarded.
 */
export function extractRevertData(error: unknown): `0x${string}` | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; current && depth < MAX_CAUSE_DEPTH; depth++) {
    if (seen.has(current)) return undefined;
    seen.add(current);

    if (current instanceof RevertError) {
      return current.revertData;
    }
    if (typeof current !== "object") return undefined;

    const err = current as Record<string, any>;

    // A declared (off-chain) error carries its own encoded data.
    const declared = asRevertData(err.revertData);
    if (declared) return declared;

    // viem errors often have a `walk` method to traverse the cause chain
    if (typeof err.walk === "function") {
      let revertData: `0x${string}` | undefined;
      err.walk((inner: any) => {
        if (revertData) return;
        if (
          inner?.data &&
          typeof inner.data === "string" &&
          inner.data.startsWith("0x")
        ) {
          revertData = inner.data as `0x${string}`;
        }
      });
      if (revertData) return revertData;
    }

    // Direct `data` property (common in JSON-RPC error responses)
    if (typeof err.data === "string" && err.data.startsWith("0x")) {
      return err.data as `0x${string}`;
    }

    current = err.cause;
  }

  return undefined;
}

/**
 * Try to decode revert data as Error(string), Panic(uint256), or raw hex.
 * Returns a single-element array with the decoded reason string.
 */
function decodeGenericError(data: `0x${string}`): {
  errorName: string;
  args: readonly unknown[];
} {
  // Try Error(string) — viem also decodes the built-in solidity errors
  // (Error, Panic) no matter which ABI is passed, so trust its errorName
  // rather than assuming the match was Error(string).
  try {
    const decoded = decodeErrorResult({
      abi: [STANDARD_ERROR_ABI],
      data,
    });
    return { errorName: decoded.errorName, args: decoded.args };
  } catch {
    // not Error(string)
  }

  // Try Panic(uint256)
  try {
    const decoded = decodeErrorResult({
      abi: [PANIC_ABI],
      data,
    });
    return { errorName: "Panic", args: decoded.args };
  } catch {
    // not Panic(uint256)
  }

  // Fall back to raw hex data as a single string arg
  return { errorName: "Unknown", args: [data] };
}

/** Panic(uint256) codes from the Solidity spec. */
const PANIC_REASONS: Record<number, string> = {
  1: "assertion failed",
  17: "arithmetic overflow or underflow",
  18: "division by zero",
  33: "invalid enum conversion",
  34: "corrupted storage byte array",
  49: "pop on empty array",
  50: "array index out of bounds",
  65: "out of memory",
  81: "call to uninitialized function",
};

/**
 * Render ABI-encoded revert data as a human-readable reason for error
 * messages: `Error(string)` reasons come back verbatim, `Panic` codes get
 * their Solidity meaning, and custom errors show their selector plus raw
 * data (the ABI isn't known here, so the name can't be recovered).
 * Returns undefined for empty revert data.
 */
export function describeRevertData(
  data: `0x${string}` | undefined,
): string | undefined {
  if (!data || data === "0x") return undefined;
  const { errorName, args } = decodeGenericError(data);
  if (errorName === "Error") return String(args[0]);
  if (errorName === "Panic") {
    const code = Number(args[0]);
    const meaning = PANIC_REASONS[code];
    const hex = `0x${code.toString(16).padStart(2, "0")}`;
    return `Panic(${hex})${meaning ? `: ${meaning}` : ""}`;
  }
  const selector = data.slice(0, 10) as `0x${string}`;
  return data.length > 10
    ? `custom error ${selector} (data: ${data})`
    : `custom error ${selector}`;
}

/**
 * Set all boolVar captures to "false" (used when a transaction succeeds
 * and optional error captures need their boolean flags cleared).
 */
export function setBoolVarsFalse(
  captures: ErrorCaptureNode[],
  bindingsManager: BindingsManager,
): void {
  for (const c of captures) {
    if (c.boolVar) {
      bindingsManager.setBinding(
        `$${c.boolVar}`,
        "false",
        USER,
        true,
        undefined,
        true,
      );
    }
  }
}

/**
 * Does this clause list require the line to fail? A single `-!>` clause
 * makes the whole alternation required, so success is an assertion failure
 * — which the caller reports, since the resolver only sees failures.
 */
export function captureListRequiresFailure(
  captures: readonly ErrorCaptureNode[],
): boolean {
  return captures.some((capture) => !capture.optional);
}

/** What one capture clause made of the failure. */
interface ClauseOutcome {
  readonly capture: ErrorCaptureNode;
  readonly matched: boolean;
  /** Values a matching clause destructures. */
  readonly args: readonly unknown[];
  /** Context name for destructure diagnostics. */
  readonly label: string;
}

/** The failure, decoded once for every clause. */
interface Failure {
  readonly error: unknown;
  readonly revertData: `0x${string}` | undefined;
  /** The raise-site refusal, found anywhere in the cause chain. */
  readonly declaredMessage: string | undefined;
}

function noMatch(capture: ErrorCaptureNode): ClauseOutcome {
  return { capture, matched: false, args: [], label: "error" };
}

/**
 * Decode `revertData` as exactly this ABI error: the selector must match
 * first, so a same-named error of another signature is not a match, and
 * a payload that does not decode against the item is not one either.
 */
function matchErrorAbi(
  abi: AbiError,
  revertData: `0x${string}`,
): readonly unknown[] | undefined {
  if (
    revertData.slice(0, 10).toLowerCase() !== errorSelector(abi).toLowerCase()
  )
    return undefined;
  try {
    const decoded = decodeErrorResult({ abi: [abi], data: revertData });
    // viem decodes the Solidity builtins whatever ABI it is given.
    if (decoded.errorName !== abi.name) return undefined;
    return decoded.args ?? [];
  } catch {
    return undefined;
  }
}

/**
 * What a generic clause binds: a declared refusal supplies its raise-site
 * message (also through a wrapper), an ordinary pre-send exception its own
 * message, and a chain failure keeps its `Error(string)` / `Panic` / raw
 * bytes decoding.
 */
function genericOutcome(
  capture: ErrorCaptureNode,
  failure: Failure,
): ClauseOutcome {
  if (failure.declaredMessage !== undefined) {
    return {
      capture,
      matched: true,
      args: [failure.declaredMessage],
      label: "error",
    };
  }
  if (failure.revertData && failure.revertData !== "0x") {
    const decoded = decodeGenericError(failure.revertData);
    return {
      capture,
      matched: true,
      args: decoded.args,
      label: `error ${decoded.errorName}`,
    };
  }
  const reason =
    failure.error instanceof Error
      ? failure.error.message
      : "transaction reverted";
  return { capture, matched: true, args: [reason], label: "error" };
}

/**
 * Evaluate one clause against the failure. Never writes a binding: the
 * whole list is evaluated before anything is published, so an unmatched
 * failure leaves no partial captures behind.
 *
 * Throws only for a script error (a malformed inline signature, an
 * ambiguous bare name). An unavailable name or an undecodable payload is
 * a plain mismatch.
 */
function evaluateClause(
  capture: ErrorCaptureNode,
  failure: Failure,
  sources: ErrorCaptureSources | undefined,
): ClauseOutcome {
  if (!capture.errorName) return genericOutcome(capture, failure);

  // Selection first, and unconditionally: a capture the script cannot
  // resolve at all is a script error whatever the failure looks like.
  const candidates = selectCaptureErrorAbis(capture, sources);
  if (!failure.revertData || failure.revertData === "0x") {
    return noMatch(capture);
  }
  for (const abi of candidates) {
    const args = matchErrorAbi(abi, failure.revertData);
    if (args) {
      return { capture, matched: true, args, label: `error ${abi.name}` };
    }
  }
  return noMatch(capture);
}

/** Publish one clause's bindings. Only called once a clause matched. */
function applyClause(
  outcome: ClauseOutcome,
  bindingsManager: BindingsManager,
): void {
  const { capture, matched } = outcome;
  if (capture.boolVar) {
    bindingsManager.setBinding(
      `$${capture.boolVar}`,
      matched ? "true" : "false",
      USER,
      true,
      undefined,
      true,
    );
    return;
  }
  if (matched && capture.captures.length > 0) {
    applyDestructure(
      capture.captures,
      outcome.args,
      outcome.label,
      bindingsManager,
    );
  }
}

/**
 * Resolve a command line's error captures against the failure it caught.
 *
 * Three steps, in order: select each clause's ABI error item, evaluate
 * every clause against the failure, then — only if at least one clause
 * matched — publish the bindings.
 *
 * Any-match: several clauses on one line are an alternation. Every flagged
 * clause reads `"true"` or `"false"` for its own match, and only a matching
 * clause's destructure applies. If no clause matches, the original error
 * object is rethrown by identity, with no binding written.
 *
 * Capture modes (mutually exclusive):
 *  - boolVar: set `$var` to `"true"` / `"false"`
 *  - captures (non-empty): destructure decoded args into variables
 *  - neither: assertion-only (accept the failure, bind nothing)
 */
export async function resolveErrorCaptures(
  error: unknown,
  sources: ErrorCaptureSources | undefined,
  errorCaptures: ErrorCaptureNode[],
  bindingsManager: BindingsManager,
): Promise<void> {
  const failure: Failure = {
    error,
    revertData: extractRevertData(error),
    declaredMessage: findDeclaredError(error)?.message,
  };

  const outcomes = errorCaptures.map((capture) =>
    evaluateClause(capture, failure, sources),
  );

  if (!outcomes.some((outcome) => outcome.matched)) throw error;

  for (const outcome of outcomes) applyClause(outcome, bindingsManager);
}
