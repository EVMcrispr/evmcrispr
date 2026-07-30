import type { NamedArgNode, Node } from "../types";
import { NodeType } from "../types";
import type { ArgDef } from "./schema";

/**
 * Named-argument (`name:value`) handling shared by the runtime binders
 * (`defineHelper`, `def`-defined helpers) and the static analyzer, so the
 * two can never disagree on what a named argument means.
 *
 * Semantics (Python-style): positional args fill the non-`namedOnly` defs
 * strictly in order; named args must come after every positional arg and
 * fill defs by name. A def covered by the positional prefix cannot also be
 * filled by name.
 */

export type NamedArgIssueCode =
  | "unknown-named-arg"
  | "duplicate-named-arg"
  | "named-before-positional"
  | "named-arg-conflict";

export interface NamedArgIssue {
  code: NamedArgIssueCode;
  message: string;
  /** The offending node — a NamedArg for every code. */
  node: NamedArgNode;
}

export interface PartitionedArgs {
  /** Non-named args, in source order. */
  positional: Node[];
  /** Named args by name (first occurrence wins on duplicates). */
  named: Map<string, NamedArgNode>;
  /** All violations found — callers either throw the first or map each
   *  to a diagnostic. */
  issues: NamedArgIssue[];
}

export function isNamedArgNode(node: Node): node is NamedArgNode {
  return node.type === NodeType.NamedArg;
}

/** The value a named arg wraps; any other node unchanged. */
export function unwrapNamedArg(node: Node): Node {
  return isNamedArgNode(node) ? node.value : node;
}

/**
 * Split a helper call's args into positional and named parts, validating
 * the named ones against `argDefs`. Pure — never throws.
 */
export function partitionHelperArgs(
  args: readonly Node[],
  argDefs: readonly ArgDef[],
): PartitionedArgs {
  const positional: Node[] = [];
  const named = new Map<string, NamedArgNode>();
  const issues: NamedArgIssue[] = [];
  let lastNamed: NamedArgNode | undefined;

  for (const arg of args) {
    if (!isNamedArgNode(arg)) {
      if (lastNamed) {
        issues.push({
          code: "named-before-positional",
          message: `named arguments must come after positional ones (${lastNamed.name}: precedes a positional argument)`,
          node: lastNamed,
        });
        lastNamed = undefined;
      }
      positional.push(arg);
      continue;
    }

    lastNamed = arg;
    const def = argDefs.find((d) => d.name === arg.name);
    if (!def || def.rest) {
      const known = argDefs
        .filter((d) => !d.rest)
        .map((d) => `${d.name}:`)
        .join(", ");
      issues.push({
        code: "unknown-named-arg",
        message:
          `unknown named argument "${arg.name}:"` +
          (known ? ` — expected one of ${known};` : " —") +
          ` quote it ('${arg.name}:…') if you meant a literal string`,
        node: arg,
      });
      continue;
    }
    if (named.has(arg.name)) {
      issues.push({
        code: "duplicate-named-arg",
        message: `duplicate named argument "${arg.name}:"`,
        node: arg,
      });
      continue;
    }
    named.set(arg.name, arg);
  }

  // Conflicts: defs already covered by the positional prefix.
  const posDefs = argDefs.filter((d) => !d.namedOnly);
  const coveredCount = Math.min(positional.length, posDefs.length);
  for (let i = 0; i < coveredCount; i++) {
    const node = named.get(posDefs[i].name);
    if (node) {
      issues.push({
        code: "named-arg-conflict",
        message: `argument "${posDefs[i].name}" is filled both positionally and by name`,
        node,
      });
      named.delete(posDefs[i].name);
    }
  }

  return { positional, named, issues };
}

/**
 * Map a cursor position among a helper's raw arg nodes to the arg
 * definition it fills — named args resolve by name, positional ones by
 * their index among the non-named nodes (rest def absorbs the tail).
 * Used by completions and signature help.
 */
export function resolveHelperArgDef(
  argDefs: readonly ArgDef[],
  nodeArgs: readonly Node[],
  argIndex: number,
): ArgDef | undefined {
  const node = nodeArgs[argIndex];
  if (node && isNamedArgNode(node)) {
    const def = argDefs.find((d) => d.name === node.name);
    if (def && !def.rest) return def;
    return undefined;
  }
  let positionalIndex = 0;
  for (let i = 0; i < Math.min(argIndex, nodeArgs.length); i++) {
    if (!isNamedArgNode(nodeArgs[i])) positionalIndex++;
  }
  const posDefs = argDefs.filter((d) => !d.namedOnly);
  const restIdx = posDefs.findIndex((d) => d.rest);
  if (restIdx >= 0 && positionalIndex >= restIdx) return posDefs[restIdx];
  return posDefs[positionalIndex];
}
