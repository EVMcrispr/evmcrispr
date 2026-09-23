import type {
  CommandExpressionNode,
  DeclaredErrorEntry,
  DeclaredErrorOwnerKind,
  ErrorCaptureNode,
  HelperFunctionNode,
  NormalizedDeclaredErrors,
} from "@evmcrispr/sdk";
import {
  CommandError,
  DeclaredError,
  declaredErrorEntries,
  MAX_CAUSE_DEPTH,
  selectCaptureErrorAbis,
} from "@evmcrispr/sdk";

import { lineHelpers } from "../astWalk";

/**
 * The declared-error schema a command line can see, and the rules every
 * consumer applies to it. This module is neutral: it knows the AST and the
 * SDK's declaration schema, never the interpreter, so the analyzer and the
 * editor can use it offline. Each consumer plugs in its own
 * `DeclarationLookup` — the interpreter resolves against live module
 * instances and bindings, a static consumer against its symbol table —
 * and gets the same union, the same order and the same ambiguity verdict.
 */

/** A resolved command or helper definition, reduced to what captures,
 *  diagnostics and completions need from it. */
export interface ErrorDeclarationOwner {
  readonly kind: DeclaredErrorOwnerKind;
  /** Display label: `swaps:twap`, `set`, `@token:holdings`, `@me`. */
  readonly label: string;
  /** The definition's normalized `errors` block; absent when it declares
   *  nothing (hand-built definitions, EVML-defined modules). */
  readonly errors: NormalizedDeclaredErrors | undefined;
}

/**
 * Resolves the definitions a line names, applying the language's own
 * precedence (qualified module, explicit `std:`, `load` imports and
 * renames, then def → import → std for unqualified names). Returns
 * `undefined` for anything that declares nothing by construction — a local
 * `def`, a constant, an on-chain-only face — and for a name that does not
 * resolve at all (execution or analysis reports that on its own terms). A
 * failure to *load* a resolved definition must propagate: a broken module
 * is not "no declarations".
 */
export interface DeclarationLookup {
  command(c: CommandExpressionNode): Promise<ErrorDeclarationOwner | undefined>;
  helper(h: HelperFunctionNode): Promise<ErrorDeclarationOwner | undefined>;
}

/**
 * The declared errors a command line can capture: the command's own first,
 * then those of every helper reachable in its arguments and options, in
 * source order. Not deduplicated — `indexDeclaredErrors` (sdk) dedupes by
 * signature and groups by name, and the resolver applies it itself.
 */
export async function collectLineDeclaredErrors(
  c: CommandExpressionNode,
  lookup: DeclarationLookup,
): Promise<DeclaredErrorEntry[]> {
  const entries: DeclaredErrorEntry[] = [];
  const command = await lookup.command(c);
  if (command) {
    entries.push(
      ...declaredErrorEntries(command.kind, command.label, command.errors),
    );
  }
  for (const h of lineHelpers(c)) {
    const helper = await lookup.helper(h);
    if (helper) {
      entries.push(
        ...declaredErrorEntries(helper.kind, helper.label, helper.errors),
      );
    }
  }
  return entries;
}

/**
 * Reject a capture list that cannot work before the line runs: a bare
 * name declared with more than one signature in the union, or a malformed
 * inline signature. A same-name collision the captures do not use is not
 * an error. Throws the resolver's own message. Only refusal clauses
 * (`-/>`, `-?/>`) resolve in the declared union, so the caller passes
 * that family alone with the declarations; a revert clause's bare name is
 * judged against the failing action's ABI when the transaction fails, so
 * it is passed with an empty union and only its inline signature, if any,
 * is checked here.
 */
export function checkCaptureNames(
  captures: readonly ErrorCaptureNode[],
  declared: readonly DeclaredErrorEntry[],
): void {
  for (const capture of captures) {
    selectCaptureErrorAbis(capture, { declared });
  }
}

/**
 * The declared refusal a command line may capture from a failure raised
 * while evaluating it: the `DeclaredError` itself, or one found through
 * the wrappers the interpreter adds on the way up (a helper's location
 * wrapper, an expression wrapper). Only a declared refusal is let through
 * a script-error wrapper: an undeclared helper failure — a read that
 * reverted inside the helper included — is not part of the helper's
 * contract and stays uncapturable. The walk stops at a `CommandError`: that
 * is another command line's boundary, and its refusal belongs to that
 * line — an outer block must never turn into a catch-all for its body.
 */
export function capturableDeclaredCause(
  error: unknown,
): DeclaredError | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current === null || typeof current !== "object") return undefined;
    if (seen.has(current)) return undefined;
    seen.add(current);
    if (current instanceof DeclaredError) return current;
    if (current instanceof CommandError) return undefined;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
