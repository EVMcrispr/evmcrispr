import { ErrorException } from "../errors";
import type { Module } from "../Module";
import type {
  Action,
  BatchableSpec,
  BlockExpressionNode,
  CommandExpressionNode,
  CompletionOverrides,
  HelperFunctionNode,
  ICommand,
  NodesInterpreters,
} from "../types";
import { NodeType } from "../types";
import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  coerceBoolean,
  getOptValue,
} from "./args";
import {
  type ArgDef,
  type ArgType,
  buildRuntimeResolver,
  type OptDef,
  validateArgType,
} from "./schema";

const SPECIAL_TYPES = new Set([
  "variable",
  "command",
  "helper",
  "expression",
  "block",
]);

function typeIncludes(type: ArgType, target: string): boolean {
  return Array.isArray(type) ? type.includes(target) : type === target;
}

function isSpecialType(type: ArgType): boolean {
  if (Array.isArray(type)) return type.some((t) => SPECIAL_TYPES.has(t));
  return SPECIAL_TYPES.has(type);
}

type ExtractResult = { ok: true; value: any } | { ok: false };

function extractSpecialArg(
  def: ArgDef,
  astNode: any,
  blockNode: BlockExpressionNode | undefined,
): ExtractResult {
  const types = Array.isArray(def.type) ? def.type : [def.type];

  if (types.includes("block") && blockNode) {
    return { ok: true, value: blockNode };
  }
  if (types.includes("expression") && astNode) {
    return { ok: true, value: astNode };
  }
  if (types.includes("command") && astNode?.type === NodeType.Bareword) {
    return { ok: true, value: astNode.value };
  }
  if (
    types.includes("helper") &&
    astNode?.type === NodeType.HelperFunctionExpression
  ) {
    return { ok: true, value: (astNode as HelperFunctionNode).name };
  }
  if (types.includes("variable")) {
    if (astNode?.type === NodeType.VariableIdentifier) {
      return { ok: true, value: astNode.value };
    }
    if (astNode?.type === NodeType.DestructurePattern) {
      return { ok: true, value: astNode.slots };
    }
  }

  return { ok: false };
}

export interface CommandContext {
  opts: Record<string, any>;
  node: CommandExpressionNode;
  interpreters: NodesInterpreters;
}

export interface CommandConfig<M extends Module> {
  name: string;
  /** Human-readable description shown in hover tooltips. */
  description?: string;
  args: ArgDef[];
  opts?: OptDef[];
  run(
    module: M,
    args: Record<string, any>,
    context: CommandContext,
  ): Promise<Action[] | void>;
  /** Override type-driven completions for specific args or opts by name.
   *  Keys are matched against arg names first, then opt names. */
  completions?: CompletionOverrides;
  /** Whether this command may run inside an atomic batch context
   *  (batch / connect / forward). Default true. A function receives the
   *  parsed args and opts; return true, false, or a string reason. */
  batchable?: BatchableSpec;
}

export function defineCommand<M extends Module>(
  config: CommandConfig<M>,
): ICommand<M> {
  const { args: argDefs, opts: optDefs = [], run } = config;

  const blockDefIndices: number[] = [];
  for (let i = 0; i < argDefs.length; i++) {
    if (typeIncludes(argDefs[i].type, "block")) blockDefIndices.push(i);
  }
  const hasBlocks = blockDefIndices.length > 0;
  const lastBlockDef = hasBlocks ? argDefs[blockDefIndices.at(-1)!] : undefined;
  const isBlockUnion = hasBlocks && Array.isArray(lastBlockDef!.type);
  const nonBlockDefs = argDefs.filter((_, i) => !blockDefIndices.includes(i));

  return {
    async run(module, c, interpreters) {
      const { interpretNode, interpretNodes } = interpreters;

      // 1. Extract trailing block(s) from AST args
      let astArgs = c.args;
      const blockNodes: (BlockExpressionNode | undefined)[] = [];

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
          if (firstRequired) {
            throw new ErrorException(
              `<${firstRequired.name}> must be a block expression`,
            );
          }
        }
      }

      // 2. Check argument length (against non-block args)
      // When isBlockUnion and no block was extracted, the expression arg is
      // a regular arg, so count against the full argDefs instead of nonBlockDefs.
      const useFullDefs = isBlockUnion && blockNodes.every((b) => !b);
      const countDefs = useFullDefs ? argDefs : nonBlockDefs;
      const effRequired = countDefs.filter(
        (a) => !a.optional && !a.rest,
      ).length;
      const effHasRest = countDefs.some((a) => a.rest);
      const effHasOptional = countDefs.some((a) => a.optional);
      const effTotalFixed = countDefs.filter((a) => !a.rest).length;

      const effectiveNode =
        hasBlocks && !useFullDefs
          ? ({ ...c, args: astArgs } as CommandExpressionNode)
          : c;
      if (effHasRest) {
        checkArgsLength(effectiveNode, {
          type: ComparisonType.Greater,
          minValue: effRequired,
        });
      } else if (effHasOptional) {
        checkArgsLength(effectiveNode, {
          type: ComparisonType.Between,
          minValue: effRequired,
          maxValue: effTotalFixed,
        });
      } else {
        checkArgsLength(effectiveNode, {
          type: ComparisonType.Equal,
          minValue: effRequired,
        });
      }

      // 3. Check options
      if (optDefs.length > 0) {
        checkOpts(
          c,
          optDefs.map((o) => o.name),
        );
      }

      // 4. Interpret arguments by type
      const parsedArgs: Record<string, any> = {};
      let blockIdx = 0;
      for (let i = 0; i < argDefs.length; i++) {
        const def = argDefs[i];

        if (isSpecialType(def.type)) {
          const blockForThis = typeIncludes(def.type, "block")
            ? blockNodes[blockIdx++]
            : undefined;
          const extracted = extractSpecialArg(def, astArgs[i], blockForThis);
          if (extracted.ok) {
            parsedArgs[def.name] = extracted.value;
            continue;
          }
          if (!Array.isArray(def.type) && !def.optional) {
            const typeLabel = def.type === "variable" ? "$variable" : def.type;
            throw new ErrorException(`<${def.name}> must be a ${typeLabel}`);
          }
        }

        // All other types (or unmatched union fallthrough): auto-interpret
        if (def.rest) {
          const restNodes = astArgs.slice(i);
          parsedArgs[def.name] = await interpretNodes(restNodes);
        } else if (astArgs[i]) {
          parsedArgs[def.name] = await interpretNode(astArgs[i]);
        }
      }

      // 5. Validate argument types (skip special types)
      for (let vi = 0; vi < argDefs.length; vi++) {
        const def = argDefs[vi];
        if (isSpecialType(def.type)) continue;
        const formatted = def.optional ? `[${def.name}]` : `<${def.name}>`;
        const value = parsedArgs[def.name];
        if (value !== undefined && !def.rest) {
          validateArgType(formatted, value, def.type, module.types);
        }
        if (def.rest && Array.isArray(value)) {
          const resolver = buildRuntimeResolver(argDefs, vi);
          if (resolver) {
            for (let ri = 0; ri < value.length; ri++) {
              const resolved = resolver(parsedArgs, ri);
              if (resolved !== "any") {
                validateArgType(
                  `${formatted}[${ri}]`,
                  value[ri],
                  resolved,
                  module.types,
                );
              }
            }
          } else if (def.type !== "any") {
            for (const item of value) {
              validateArgType(formatted, item, def.type, module.types);
            }
          }
        }
      }

      // 6. Coerce bool args from string to native boolean
      for (const def of argDefs) {
        if (def.type === "bool" && typeof parsedArgs[def.name] === "string") {
          parsedArgs[def.name] = coerceBoolean(parsedArgs[def.name]);
        }
      }

      // 7. Interpret and validate options
      const parsedOpts: Record<string, any> = {};
      for (const optDef of optDefs) {
        const value = await getOptValue(c, optDef.name, interpretNode);
        if (value !== undefined) {
          validateArgType(`--${optDef.name}`, value, optDef.type, module.types);
          parsedOpts[optDef.name] = value;
        }
      }

      // 8. Enforce batch compatibility before the user's run function, so
      // non-batchable commands can't mutate interpreter state (e.g. switch
      // changing the active chain) before being rejected.
      if (interpreters.batchContext) {
        const batchable = config.batchable ?? true;
        const verdict =
          typeof batchable === "function"
            ? batchable(parsedArgs, parsedOpts)
            : batchable;
        if (verdict !== true) {
          throw new ErrorException(
            typeof verdict === "string"
              ? verdict
              : `command "${config.name}" cannot be used inside ${interpreters.batchContext.name}`,
          );
        }
      }

      // 9. Call user's run function
      return run(module as M, parsedArgs, {
        opts: parsedOpts,
        node: c,
        interpreters,
      });
    },

    argDefs,
    optDefs,
    completions: config.completions,
    description: config.description,
    batchable: config.batchable,
  };
}
