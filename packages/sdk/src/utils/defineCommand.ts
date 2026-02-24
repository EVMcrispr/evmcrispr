import { ErrorException } from "../errors";
import type { Module } from "../Module";
import type {
  Action,
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
  if (
    types.includes("variable") &&
    astNode?.type === NodeType.VariableIdentifier
  ) {
    return { ok: true, value: astNode.value };
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
}

export function defineCommand<M extends Module>(
  config: CommandConfig<M>,
): ICommand<M> {
  const { args: argDefs, opts: optDefs = [], run } = config;

  const lastType = argDefs.at(-1)?.type;
  const hasTrailingBlock =
    lastType !== undefined && typeIncludes(lastType, "block");
  const isBlockUnion = hasTrailingBlock && Array.isArray(lastType);
  const nonBlockDefs = hasTrailingBlock ? argDefs.slice(0, -1) : argDefs;
  const _requiredCount = nonBlockDefs.filter(
    (a) => !a.optional && !a.rest,
  ).length;
  const _hasRest = nonBlockDefs.some((a) => a.rest);
  const _hasOptional = nonBlockDefs.some((a) => a.optional);
  const _totalFixed = nonBlockDefs.filter((a) => !a.rest).length;

  return {
    async run(module, c, interpreters) {
      const { interpretNode, interpretNodes } = interpreters;

      // 1. Extract trailing block if last argDef is "block"
      let astArgs = c.args;
      let blockNode: BlockExpressionNode | undefined;

      if (hasTrailingBlock) {
        const lastNode = astArgs.at(-1);
        if (lastNode?.type === NodeType.BlockExpression) {
          blockNode = lastNode as BlockExpressionNode;
          astArgs = astArgs.slice(0, -1);
        } else if (!isBlockUnion) {
          const blockDef = argDefs.at(-1)!;
          throw new ErrorException(
            `<${blockDef.name}> must be a block expression`,
          );
        }
      }

      // 2. Check argument length (against non-block args)
      // When isBlockUnion and no block was extracted, the expression arg is
      // a regular arg, so count against the full argDefs instead of nonBlockDefs.
      const useFullDefs = isBlockUnion && !blockNode;
      const countDefs = useFullDefs ? argDefs : nonBlockDefs;
      const effRequired = countDefs.filter(
        (a) => !a.optional && !a.rest,
      ).length;
      const effHasRest = countDefs.some((a) => a.rest);
      const effHasOptional = countDefs.some((a) => a.optional);
      const effTotalFixed = countDefs.filter((a) => !a.rest).length;

      const effectiveNode =
        hasTrailingBlock && !useFullDefs
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
      for (let i = 0; i < argDefs.length; i++) {
        const def = argDefs[i];

        if (isSpecialType(def.type)) {
          const extracted = extractSpecialArg(def, astArgs[i], blockNode);
          if (extracted.ok) {
            parsedArgs[def.name] = extracted.value;
            continue;
          }
          if (!Array.isArray(def.type)) {
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
      for (const def of argDefs) {
        if (isSpecialType(def.type)) continue;
        const formatted = def.optional ? `[${def.name}]` : `<${def.name}>`;
        const value = parsedArgs[def.name];
        if (value !== undefined && !def.rest) {
          validateArgType(formatted, value, def.type, module.types);
        }
        if (def.rest && Array.isArray(value)) {
          if (def.type !== "any") {
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

      // 8. Call user's run function
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
  };
}
