import type { Node } from "../types";
import { NodeType } from "../types";
import type { ArgDef, ArgType } from "./schema";

/** Arg types that are extracted from the raw AST instead of interpreted. */
export const SPECIAL_ARG_TYPES = new Set([
  "variable",
  "command",
  "helper",
  "expression",
  "block",
]);

export function isSpecialArgType(type: ArgType): boolean {
  if (Array.isArray(type)) return type.some((t) => SPECIAL_ARG_TYPES.has(t));
  return SPECIAL_ARG_TYPES.has(type);
}

/**
 * Whether a raw AST node structurally matches a special arg type, without
 * interpreting it. Mirrors the extraction rules used by `defineCommand`.
 */
export function nodeMatchesSpecialType(type: ArgType, node: Node): boolean {
  const types = Array.isArray(type) ? type : [type];
  if (types.includes("expression")) return true;
  if (types.includes("block") && node.type === NodeType.BlockExpression) {
    return true;
  }
  if (types.includes("command") && node.type === NodeType.Bareword) {
    return true;
  }
  if (
    types.includes("helper") &&
    node.type === NodeType.HelperFunctionExpression
  ) {
    return true;
  }
  if (
    types.includes("variable") &&
    (node.type === NodeType.VariableIdentifier ||
      node.type === NodeType.DestructurePattern)
  ) {
    return true;
  }
  return false;
}

/**
 * Map an argument position to its arg definition index, skipping optional
 * special-typed defs whose node doesn't structurally match. This lets a
 * command declare shapes like `loop [variable] <connector> <value> <block>`
 * where omitting the optional arg shifts the remaining ones left.
 *
 * Returns -1 when the position maps to no definition.
 */
export function resolveArgDefIndex(
  argDefs: readonly ArgDef[],
  nodeArgs: readonly Node[],
  argIndex: number,
): number {
  let cursor = 0;
  for (let i = 0; i < argDefs.length; i++) {
    const def = argDefs[i];
    if (def.rest) return cursor <= argIndex ? i : -1;
    const node = nodeArgs[cursor];
    if (
      def.optional &&
      isSpecialArgType(def.type) &&
      node !== undefined &&
      !nodeMatchesSpecialType(def.type, node)
    ) {
      continue;
    }
    if (cursor === argIndex) return i;
    cursor++;
  }
  return -1;
}
