import type { BlockExpressionNode, NamedArgNode, Node } from "../types";
import { NodeType } from "../types";
import { type Comparison, ComparisonType, checkComparisonError } from "./args";
import type { ArgDef, ArgType } from "./schema";

function typeIncludes(type: ArgType, target: string): boolean {
  return Array.isArray(type) ? type.includes(target) : type === target;
}

/** Precomputed, argDef-only facts about a command's block arguments. Cache
 *  this once per command definition and pass it to `computeCommandArity` so
 *  the per-call work stays minimal. */
export interface CommandArityMeta {
  /** Indices of argDefs that accept a `block`. */
  blockDefIndices: number[];
  hasBlocks: boolean;
  /** The last block def is a union type (e.g. `["expression", "block"]`),
   *  so its slot may collapse into a regular argument. */
  isBlockUnion: boolean;
  /** argDefs excluding the block defs (used for the arg-count comparison). */
  nonBlockDefs: ArgDef[];
}

export function prepareCommandArity(
  argDefs: readonly ArgDef[],
): CommandArityMeta {
  const blockDefIndices: number[] = [];
  for (let i = 0; i < argDefs.length; i++) {
    if (typeIncludes(argDefs[i].type, "block")) blockDefIndices.push(i);
  }
  const hasBlocks = blockDefIndices.length > 0;
  const lastBlockDef = hasBlocks ? argDefs[blockDefIndices.at(-1)!] : undefined;
  const isBlockUnion = hasBlocks && Array.isArray(lastBlockDef!.type);
  const nonBlockDefs = argDefs.filter((_, i) => !blockDefIndices.includes(i));
  return { blockDefIndices, hasBlocks, isBlockUnion, nonBlockDefs };
}

/** Build the arg-count comparison for a set of "counting" defs (block defs
 *  already removed, unless a union block collapsed to a regular arg). */
function buildComparison(countDefs: readonly ArgDef[]): Comparison {
  const required = countDefs.filter((a) => !a.optional && !a.rest).length;
  const hasRest = countDefs.some((a) => a.rest);
  const hasOptional = countDefs.some((a) => a.optional);
  const totalFixed = countDefs.filter((a) => !a.rest).length;

  if (hasRest) {
    return { type: ComparisonType.Greater, minValue: required };
  }
  if (hasOptional) {
    return {
      type: ComparisonType.Between,
      minValue: required,
      maxValue: totalFixed,
    };
  }
  return { type: ComparisonType.Equal, minValue: required };
}

export interface CommandArityResult {
  /** AST args with the trailing block(s) removed. */
  astArgs: Node[];
  /** Extracted block nodes, one slot per block def (`undefined` if absent). */
  blockNodes: (BlockExpressionNode | undefined)[];
  /** The union block collapsed into a regular expression arg, so counting
   *  uses the full argDef list. */
  useFullDefs: boolean;
  /** Name of the first required block def that received no block, if any. */
  missingBlockName?: string;
  /** Arg-count comparison run against `effectiveArgCount`. */
  comparison: Comparison;
  /** Number of (non-block) args the comparison is checked against. */
  effectiveArgCount: number;
  /** Whether `effectiveArgCount` violates `comparison`. */
  isError: boolean;
}

/**
 * Compute a command's block extraction and argument-count check from its
 * argDefs and the raw AST args. This is the single source of truth shared by
 * `defineCommand`'s runtime and the static semantic analyzer, so the two can
 * never disagree on what counts as the right number of arguments.
 */
export function computeCommandArity(
  argDefs: readonly ArgDef[],
  nodeArgs: readonly Node[],
  meta?: CommandArityMeta,
): CommandArityResult {
  // Named args (`name:value`) fill their def by name, so both the node and
  // the filled def leave the positional count. `namedOnly` defs are never
  // positional. Commands see neither, so the cached `meta` fast path below
  // is untouched for them.
  const namedNames = new Set(
    nodeArgs
      .filter((n) => n.type === NodeType.NamedArg)
      .map((n) => (n as NamedArgNode).name),
  );
  if (namedNames.size > 0 || argDefs.some((d) => d.namedOnly)) {
    argDefs = argDefs.filter((d) => !d.namedOnly && !namedNames.has(d.name));
    nodeArgs = nodeArgs.filter((n) => n.type !== NodeType.NamedArg);
    meta = undefined;
  }
  const { blockDefIndices, hasBlocks, isBlockUnion, nonBlockDefs } =
    meta ?? prepareCommandArity(argDefs);

  let astArgs = nodeArgs.slice();
  const blockNodes: (BlockExpressionNode | undefined)[] = [];
  let missingBlockName: string | undefined;

  if (hasBlocks) {
    const extracted: BlockExpressionNode[] = [];
    let endIdx = astArgs.length - 1;
    while (
      endIdx >= 0 &&
      extracted.length < blockDefIndices.length &&
      astArgs[endIdx]?.type === NodeType.BlockExpression
    ) {
      extracted.unshift(astArgs[endIdx] as BlockExpressionNode);
      endIdx--;
    }
    astArgs = astArgs.slice(0, endIdx + 1);

    for (let i = 0; i < blockDefIndices.length; i++) {
      blockNodes.push(i < extracted.length ? extracted[i] : undefined);
    }

    if (extracted.length === 0 && !isBlockUnion) {
      const firstRequired = blockDefIndices
        .map((idx) => argDefs[idx])
        .find((d) => !d.optional);
      if (firstRequired) missingBlockName = firstRequired.name;
    }
  }

  const useFullDefs = isBlockUnion && blockNodes.every((b) => !b);
  const countDefs = useFullDefs ? argDefs : nonBlockDefs;
  const comparison = buildComparison(countDefs);

  const effectiveArgCount =
    hasBlocks && !useFullDefs ? astArgs.length : nodeArgs.length;
  const isError = checkComparisonError(effectiveArgCount, comparison);

  return {
    astArgs,
    blockNodes,
    useFullDefs,
    missingBlockName,
    comparison,
    effectiveArgCount,
    isError,
  };
}
