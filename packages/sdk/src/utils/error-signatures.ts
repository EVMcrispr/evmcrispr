import type { AbiError } from "abitype";
import type { Abi, Hex } from "viem";
import { parseAbiItem, toFunctionSelector } from "viem";

import { ErrorException } from "../errors";
import type { ErrorCaptureNode } from "../types";

/** Which kind of definition declared an error, for diagnostics and docs. */
export type DeclaredErrorOwnerKind = "command" | "helper";

/**
 * One declared error contributed to a command line: the command's own
 * declarations plus those of every helper reachable in its arguments and
 * options. The ABI item is derived once, at collection time.
 */
export interface DeclaredErrorEntry {
  /** The declared error's name. */
  readonly name: string;
  /** The ABI error item derived from the declaration's fields. */
  readonly abi: AbiError;
  /** The declaration's description (docs, completions, diagnostics). */
  readonly description: string;
  /** Whether a command or a helper declared it. */
  readonly ownerKind: DeclaredErrorOwnerKind;
  /** The owner's display label, e.g. `swaps:twap` or `@token:holdings`. */
  readonly ownerLabel: string;
}

/**
 * Everything a capture clause may resolve its error name against.
 *
 * The two sources are kept apart so their precedence survives: a bare name
 * selects a declaration first and only then the failing action's contract
 * ABI.
 */
export interface ErrorCaptureSources {
  /** ABI of the failing action's target contract, when one is known. */
  readonly abi?: Abi;
  /**
   * Declared errors of the command and its reachable helpers, in
   * declaration order (the command's first).
   */
  readonly declared?: readonly DeclaredErrorEntry[];
}

/** Declared entries grouped for lookup, identical signatures removed. */
export interface DeclaredErrorIndex {
  /** Unique entries in declaration order (first occurrence wins). */
  readonly entries: readonly DeclaredErrorEntry[];
  /** Name -> its distinct signatures, in declaration order. */
  readonly byName: ReadonlyMap<string, readonly DeclaredErrorEntry[]>;
}

/** `Error(string)`, the ABI shape of a `require`/`revert` reason string. */
export const STANDARD_ERROR_ABI = parseAbiItem(
  "error Error(string)",
) as AbiError;
/** `Panic(uint256)`, the ABI shape of a Solidity panic code. */
export const PANIC_ABI = parseAbiItem("error Panic(uint256)") as AbiError;

/** The Solidity built-ins every contract can raise, looked up by bare name. */
function builtinErrorAbi(errorName: string): AbiError | undefined {
  if (errorName === "Error") return STANDARD_ERROR_ABI;
  if (errorName === "Panic") return PANIC_ABI;
  return undefined;
}

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
  const builtin = builtinErrorAbi(errorName);
  if (builtin) return builtin;
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

/** Render an ABI error item as its canonical `Name(type,type)` signature. */
export function errorSignature(error: AbiError): string {
  return `${error.name}(${error.inputs.map((input) => input.type).join(",")})`;
}

/**
 * Group declared entries for lookup. Entries sharing a canonical signature
 * are the same error declared twice (a shared block spread into a command
 * and one of its helpers); the first occurrence is kept, so declaration
 * order also decides which description is displayed. The key is the
 * signature, not its 4-byte selector: two genuinely different declarations
 * can collide on a selector, and dropping one of those would hide it.
 */
export function indexDeclaredErrors(
  entries: readonly DeclaredErrorEntry[] | undefined,
): DeclaredErrorIndex {
  const unique: DeclaredErrorEntry[] = [];
  const byName = new Map<string, DeclaredErrorEntry[]>();
  const seen = new Set<string>();

  for (const entry of entries ?? []) {
    const signature = errorSignature(entry.abi);
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(entry);
    const bucket = byName.get(entry.name);
    if (bucket) bucket.push(entry);
    else byName.set(entry.name, [entry]);
  }

  return { entries: unique, byName };
}

/**
 * The ABI error items a capture clause may decode against, in the order
 * they are tried.
 *
 * Precedence, for a bare name: the declared union first, then the Solidity
 * builtins, then every same-named error of the failing action's contract
 * ABI (all of them — an overloaded name must not silently resolve to
 * whichever item `getAbiItem` happens to return first). An inline
 * signature bypasses the lookup entirely.
 *
 * An empty result means the name is unavailable here, which the resolver
 * reads as "this clause does not match". Malformed capture syntax and an
 * ambiguous bare name are script errors instead: they throw.
 */
export function selectCaptureErrorAbis(
  capture: ErrorCaptureNode,
  sources: ErrorCaptureSources | undefined,
): readonly AbiError[] {
  const { errorName } = capture;
  // A generic clause carries no signature at all.
  if (!errorName) return [];

  // An explicit signature selects that exact ABI error.
  if (capture.errorParams != null) {
    return [errorAbiFromSignature(errorName, capture.errorParams)];
  }

  // Declarations win over contract metadata for a bare name. (`Error` and
  // `Panic` are reserved names no declaration may use, so the builtins
  // below can never be shadowed here.)
  const declared = indexDeclaredErrors(sources?.declared).byName.get(errorName);
  if (declared && declared.length > 0) {
    if (declared.length > 1) {
      const shown = declared
        .map(
          (entry) =>
            `${errorSignature(entry.abi)} by ${entry.ownerKind} "${entry.ownerLabel}"`,
        )
        .join(", ");
      throw new ErrorException(
        `error "${errorName}" is declared with more than one signature (${shown}) — spell the one you mean inline, e.g. ${errorSignature(declared[0].abi)}`,
      );
    }
    return [declared[0].abi];
  }

  const builtin = builtinErrorAbi(errorName);
  if (builtin) return [builtin];

  return (sources?.abi ?? []).filter(
    (item): item is AbiError =>
      item.type === "error" && item.name === errorName,
  );
}
