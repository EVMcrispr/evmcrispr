import type { AbiError } from "abitype";
import type { Abi, Hex } from "viem";
import {
  decodeErrorResult,
  getAbiItem,
  parseAbiItem,
  toFunctionSelector,
} from "viem";

import type { BindingsManager } from "../BindingsManager";
import { ErrorException, RevertError } from "../errors";
import type { ErrorCaptureNode } from "../types";
import { BindingsSpace } from "../types";
import { applyDestructure } from "./destructure";

const { USER } = BindingsSpace;

/**
 * Walk a viem / provider error chain looking for raw ABI-encoded revert data.
 *
 * Covers:
 *  - RevertError (our own, thrown by EthereumJS backend and fork command)
 *  - viem BaseError chain (TransactionExecutionError wrapping inner errors)
 *  - Generic errors whose `data` property is a hex string
 */
export function extractRevertData(error: unknown): `0x${string}` | undefined {
  if (error instanceof RevertError) {
    return error.revertData;
  }

  if (error && typeof error === "object") {
    const err = error as Record<string, any>;

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

    // Nested cause chain
    if (err.cause) {
      return extractRevertData(err.cause);
    }
  }

  return undefined;
}

const STANDARD_ERROR_ABI = parseAbiItem("error Error(string)") as AbiError;
const PANIC_ABI = parseAbiItem("error Panic(uint256)") as AbiError;

/**
 * Build an ABI error item from a name and inline parameter types, with the
 * `Error(string)` / `Panic(uint256)` builtins recognized by bare name.
 * This is the build-time face of an error signature: no contract ABI is
 * consulted, so anything else must spell its types inline.
 */
export function errorAbiFromSignature(
  errorName: string,
  errorParams: string[] | undefined,
): AbiError {
  if (errorParams != null) {
    const sig = `error ${errorName}(${errorParams.join(",")})`;
    try {
      return parseAbiItem(sig) as AbiError;
    } catch (err) {
      const err_ = err as Error;
      throw new ErrorException(
        `invalid inline error signature "${sig}": ${err_.message}`,
      );
    }
  }
  if (errorName === "Error") return STANDARD_ERROR_ABI;
  if (errorName === "Panic") return PANIC_ABI;
  throw new ErrorException(
    `error "${errorName}" needs its parameter types spelled inline, e.g. ${errorName}(uint256,address)`,
  );
}

/**
 * The 4-byte selector of an ABI error. Errors hash exactly as functions do
 * (keccak of `Name(canonicalTypes)`), so the item is recast through the
 * function selector path — `parseAbiItem` has already canonicalized the
 * types (`uint` -> `uint256`, tuples flattened to their components).
 */
export function errorSelector(error: AbiError): Hex {
  return toFunctionSelector({
    type: "function",
    name: error.name,
    inputs: error.inputs,
    outputs: [],
    stateMutability: "view",
  });
}

/**
 * Build an ABI error item from an ErrorCaptureNode.
 */
function getErrorAbi(
  capture: ErrorCaptureNode,
  abi: Abi | undefined,
): AbiError {
  if (
    capture.errorParams != null ||
    capture.errorName === "Error" ||
    capture.errorName === "Panic"
  ) {
    return errorAbiFromSignature(capture.errorName!, capture.errorParams);
  }

  if (!abi) {
    throw new ErrorException(
      `no ABI available for error "${capture.errorName}" decoding (use inline signature e.g. ${capture.errorName}(uint256,address))`,
    );
  }

  try {
    const item = getAbiItem({ abi, name: capture.errorName! });
    if (item?.type !== "error") {
      throw new Error("not found");
    }
    return item as AbiError;
  } catch {
    throw new ErrorException(
      `error "${capture.errorName}" not found in contract ABI`,
    );
  }
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
 * Resolve error captures from a caught transaction error.
 *
 * Extracts revert data from the error, decodes it against the error ABI,
 * and stores captured values as user bindings.
 *
 * Capture modes (mutually exclusive):
 *  - boolVar: set `$var = "true"` on match
 *  - captures (non-empty): destructure decoded args into variables
 *  - neither: assertion-only (verify match, bind nothing)
 *
 * For `-?!>` (optional) with boolVar, mismatches set `$var = "false"`.
 * All other mismatches throw.
 */
export async function resolveErrorCaptures(
  error: unknown,
  abi: Abi | undefined,
  errorCaptures: ErrorCaptureNode[],
  bindingsManager: BindingsManager,
): Promise<void> {
  const revertData = extractRevertData(error);

  for (const capture of errorCaptures) {
    if (!capture.errorName) {
      // Generic catch-all — always matches any revert
      if (capture.boolVar) {
        bindingsManager.setBinding(
          `$${capture.boolVar}`,
          "true",
          USER,
          true,
          undefined,
          true,
        );
        continue;
      }
      if (capture.captures.length === 0) continue;

      if (!revertData || revertData === "0x") {
        const reason =
          error instanceof Error ? error.message : "transaction reverted";
        applyDestructure(capture.captures, [reason], "error", bindingsManager);
        continue;
      }

      const decoded = decodeGenericError(revertData);
      applyDestructure(
        capture.captures,
        decoded.args,
        `error ${decoded.errorName}`,
        bindingsManager,
      );
      continue;
    }

    // Named error capture
    const errorAbi = getErrorAbi(capture, abi);

    if (!revertData || revertData === "0x") {
      if (capture.optional && capture.boolVar) {
        bindingsManager.setBinding(
          `$${capture.boolVar}`,
          "false",
          USER,
          true,
          undefined,
          true,
        );
        continue;
      }
      throw new ErrorException(
        `expected error "${capture.errorName}" but transaction reverted with no data (empty revert / jump error)`,
      );
    }

    try {
      const decoded = decodeErrorResult({
        abi: [errorAbi],
        data: revertData,
      });

      if (decoded.errorName !== capture.errorName) {
        throw new ErrorException(
          `expected error "${capture.errorName}" but got "${decoded.errorName}"`,
        );
      }

      if (capture.boolVar) {
        bindingsManager.setBinding(
          `$${capture.boolVar}`,
          "true",
          USER,
          true,
          undefined,
          true,
        );
      } else if (capture.captures.length > 0) {
        applyDestructure(
          capture.captures,
          decoded.args,
          `error ${capture.errorName}`,
          bindingsManager,
        );
      }
    } catch (err) {
      if (err instanceof ErrorException) {
        if (capture.optional && capture.boolVar) {
          bindingsManager.setBinding(
            `$${capture.boolVar}`,
            "false",
            USER,
            true,
            undefined,
            true,
          );
          continue;
        }
        throw err;
      }
      if (capture.optional && capture.boolVar) {
        bindingsManager.setBinding(
          `$${capture.boolVar}`,
          "false",
          USER,
          true,
          undefined,
          true,
        );
        continue;
      }
      throw new ErrorException(
        `failed to decode error "${capture.errorName}" from revert data: ${(err as Error).message}`,
      );
    }
  }
}
