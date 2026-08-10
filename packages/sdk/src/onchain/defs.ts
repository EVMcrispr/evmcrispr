/**
 * User-defined on-chain helpers: `def @name! "$x: number -> number" …`.
 *
 * A def's body is stored as an un-evaluated AST. Off-chain, `def` runs it by
 * pushing a scope, binding each `$param` to the argument's VALUE, and
 * interpreting. That cannot work here: an on-chain argument has no value at
 * build time — it is an operand, and often the fold element's marker word.
 *
 * So the compile path SUBSTITUTES instead. It copies the body and replaces
 * every `$param` identifier with the caller's argument NODE, then compiles
 * the result. The substituted node may itself be a precompiled operand (see
 * `operandNode`), which is exactly how a face hands the element in: the
 * marker lands wherever the body names its parameter, and a body naming it
 * twice produces two substitution windows for free.
 */
import { ErrorException } from "../errors";
import type { DefValue, HelperFunctionNode, Node } from "../types";
import { BindingsSpace, NodeType } from "../types";
import { partitionHelperArgs } from "../utils/namedArgs";
import type { ArgDef } from "../utils/schema";
import type { CompileCtx } from "./types";

/** Keys whose values may hold child nodes. Mirrors the shapes the compiler
 *  walks elsewhere; anything else is copied by reference. */
const CHILD_KEYS = ["args", "elements", "value", "target", "body"] as const;

/**
 * A copy of `node` with each `$name` identifier replaced by its bound node.
 *
 * Shadowing: a nested `def` that rebinds one of these names owns it from
 * there down, so descending into its body would rewrite the wrong `$x`.
 * Nested defs are not substituted into at all — the inner def is compiled
 * later, through its own call, with its own bindings.
 */
function substitute(node: Node, bound: ReadonlyMap<string, Node>): Node {
  if (!node || typeof node !== "object") return node;

  if (node.type === NodeType.VariableIdentifier) {
    const replacement = bound.get((node as { value: string }).value);
    return replacement ?? node;
  }

  // `def` inside a body opens a new binding scope for its own parameters.
  if (
    node.type === NodeType.CommandExpression &&
    (node as unknown as { name?: string }).name === "def"
  ) {
    return node;
  }

  const source = node as unknown as Record<string, unknown>;
  const copy: Record<string, unknown> = { ...source };
  let changed = false;
  for (const key of CHILD_KEYS) {
    const child = source[key];
    if (Array.isArray(child)) {
      const mapped = child.map((c) =>
        c && typeof c === "object" && "type" in c
          ? substitute(c as Node, bound)
          : c,
      );
      if (mapped.some((c, i) => c !== child[i])) {
        copy[key] = mapped;
        changed = true;
      }
      continue;
    }
    if (child && typeof child === "object" && "type" in child) {
      const mapped = substitute(child as Node, bound);
      if (mapped !== child) {
        copy[key] = mapped;
        changed = true;
      }
    }
  }
  return changed ? (copy as unknown as Node) : node;
}

/** Bind the call's arguments to the def's parameters by name, the same way
 *  `def`'s own runner does — named args fill by name, the rest positionally. */
function bindArgs(
  name: string,
  argDefs: readonly ArgDef[],
  node: HelperFunctionNode,
): Map<string, Node> {
  const { positional, named, issues } = partitionHelperArgs(
    node.args,
    argDefs as ArgDef[],
  );
  if (issues.length > 0) {
    throw new ErrorException(`@${name}: ${issues[0].message}`);
  }

  const countDefs = argDefs.filter((p) => !named.has(p.name));
  const required = countDefs.filter((p) => !p.optional && !p.rest).length;
  const total = countDefs.filter((p) => !p.rest).length;
  if (countDefs.some((p) => p.rest)) {
    throw new ErrorException(
      `@${name} has a rest parameter, which an on-chain definition cannot take — the calldata layout is fixed when the assertion is built, so the number of arguments has to be known then`,
    );
  }
  if (positional.length < required || positional.length > total) {
    const expected =
      required === total ? `${required}` : `${required}-${total}`;
    throw new ErrorException(
      `@${name} expects ${expected} argument(s), got ${positional.length}`,
    );
  }

  const bound = new Map<string, Node>();
  let cursor = 0;
  for (const def of argDefs) {
    const argNode = named.get(def.name)?.value ?? positional[cursor++];
    if (argNode) bound.set(`$${def.name}`, argNode);
    else if (!def.optional) {
      throw new ErrorException(`@${name} is missing argument $${def.name}`);
    }
  }
  return bound;
}

/** The on-chain definition bound to `@name`, if there is one. A def is
 *  keyed with its `!` intact, so the node's own name is the key. */
export function lookupOnchainDef(
  ctx: CompileCtx,
  name: string,
): DefValue | undefined {
  const v = ctx.module.bindingsManager.getBindingValue(
    `@${name}`,
    BindingsSpace.DEF,
  ) as DefValue | undefined;
  return v?.kind === "helper" ? v : undefined;
}

/**
 * Whether `name`'s definition can reach itself through other definitions.
 *
 * This is a question about DEFINITIONS, not about a particular expansion,
 * and that distinction is the whole point. Tracking names down the
 * expansion instead reports a false cycle for `@dbl!(@dbl!($x))`: two
 * sibling applications, each terminating, but the inner one is compiled
 * while the outer one is still on the stack. Reachability over the stored
 * bodies has no such confusion — `@quad!` mentions `@dbl!`, `@dbl!`
 * mentions nobody, so nothing recurses.
 *
 * Resolved at CALL time rather than at `def` time, because mutual recursion
 * is only visible once both halves exist.
 */
function findCycle(
  ctx: CompileCtx,
  name: string,
  def: DefValue,
): string[] | undefined {
  const lookup = (n: string): DefValue | undefined => {
    const v = ctx.module.bindingsManager.getBindingValue(
      `@${n}`,
      BindingsSpace.DEF,
    ) as DefValue | undefined;
    return v?.kind === "helper" ? v : undefined;
  };

  const seen = new Set<string>();
  const walk = (
    _current: string,
    body: Node,
    path: string[],
  ): string[] | undefined => {
    for (const called of bangCallsIn(body)) {
      const next = [...path, called];
      if (called === name) return next;
      if (seen.has(called)) continue;
      seen.add(called);
      const target = lookup(called);
      if (!target?.bodyNode) continue;
      const found = walk(called, target.bodyNode, next);
      if (found) return found;
    }
    return undefined;
  };
  return walk(name, def.bodyNode, [name]);
}

/** Every `!` helper name called anywhere in a body. */
function bangCallsIn(node: Node): string[] {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const rec = n as Record<string, unknown>;
    if (
      rec.type === NodeType.HelperFunctionExpression &&
      typeof rec.name === "string" &&
      rec.name.endsWith("!")
    ) {
      out.push(rec.name);
    }
    for (const key of CHILD_KEYS) {
      const child = rec[key];
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(node);
  return out;
}

/**
 * Compile a call to a user-defined on-chain helper by inlining it.
 *
 * `compileBody` is the compiler's own operand entry point, passed in to keep
 * this module free of a cycle back into `compile.ts`.
 */
export async function compileDefCall(
  ctx: CompileCtx,
  def: DefValue,
  node: HelperFunctionNode,
  compileBody: (ctx: CompileCtx, node: Node) => Promise<unknown>,
): Promise<unknown> {
  const name = node.name;

  const cycle = findCycle(ctx, name, def);
  if (cycle) {
    throw new ErrorException(
      `@${name} is defined in terms of itself (${cycle
        .map((n) => `@${n}`)
        .join(
          " → ",
        )}) — an on-chain definition is inlined where it is used, so it cannot recurse`,
    );
  }

  const bound = bindArgs(name, def.argDefs ?? [], node);
  return compileBody(ctx, substitute(def.bodyNode, bound));
}
