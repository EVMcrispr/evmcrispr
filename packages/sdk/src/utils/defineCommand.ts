import { ErrorException } from "../errors";
import type { Module } from "../Module";
import type {
  Action,
  BlockExpressionNode,
  CommandExpressionNode,
  CompletionOverrides,
  ICommand,
  NodesInterpreters,
} from "../types";
import { NodeType } from "../types";
import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  getOptValue,
} from "./args";
import { type ArgDef, type OptDef, validateArgType } from "./schema";

export interface CommandContext {
  opts: Record<string, any>;
  node: CommandExpressionNode;
  interpreters: NodesInterpreters;
}

export interface CommandConfig<M extends Module> {
  name: string;
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

  const hasTrailingBlock = argDefs.at(-1)?.type === "block";
  const nonBlockDefs = hasTrailingBlock ? argDefs.slice(0, -1) : argDefs;
  const requiredCount = nonBlockDefs.filter(
    (a) => !a.optional && !a.rest,
  ).length;
  const hasRest = nonBlockDefs.some((a) => a.rest);
  const hasOptional = nonBlockDefs.some((a) => a.optional);
  const totalFixed = nonBlockDefs.filter((a) => !a.rest).length;

  return {
    async run(module, c, interpreters) {
      const { interpretNode, interpretNodes } = interpreters;

      // 1. Extract trailing block if last argDef is "block"
      let astArgs = c.args;
      let blockNode: BlockExpressionNode | undefined;

      if (hasTrailingBlock) {
        const lastNode = astArgs.at(-1);
        const blockDef = argDefs.at(-1)!;
        if (!lastNode || lastNode.type !== NodeType.BlockExpression) {
          throw new ErrorException(
            `<${blockDef.name}> must be a block expression`,
          );
        }
        blockNode = lastNode as BlockExpressionNode;
        astArgs = astArgs.slice(0, -1);
      }

      // 2. Check argument length (against non-block args)
      const effectiveNode = hasTrailingBlock
        ? ({ ...c, args: astArgs } as CommandExpressionNode)
        : c;
      if (hasRest) {
        checkArgsLength(effectiveNode, {
          type: ComparisonType.Greater,
          minValue: requiredCount,
        });
      } else if (hasOptional) {
        checkArgsLength(effectiveNode, {
          type: ComparisonType.Between,
          minValue: requiredCount,
          maxValue: totalFixed,
        });
      } else {
        checkArgsLength(effectiveNode, {
          type: ComparisonType.Equal,
          minValue: requiredCount,
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

        if (def.type === "block") {
          parsedArgs[def.name] = blockNode;
          continue;
        }

        if (def.type === "variable") {
          const node = astArgs[i];
          if (!node || node.type !== NodeType.VariableIdentifier) {
            throw new ErrorException(`<${def.name}> must be a $variable`);
          }
          parsedArgs[def.name] = node.value;
          continue;
        }

        // All other types: auto-interpret
        if (def.rest) {
          const restNodes = astArgs.slice(i);
          parsedArgs[def.name] = await interpretNodes(restNodes);
        } else if (astArgs[i]) {
          parsedArgs[def.name] = await interpretNode(astArgs[i]);
        }
      }

      // 5. Validate argument types
      for (const def of argDefs) {
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

      // 6. Interpret and validate options
      const parsedOpts: Record<string, any> = {};
      for (const optDef of optDefs) {
        const value = await getOptValue(c, optDef.name, interpretNode);
        if (value !== undefined) {
          validateArgType(`--${optDef.name}`, value, optDef.type, module.types);
          parsedOpts[optDef.name] = value;
        }
      }

      // 7. Call user's run function
      return run(module as M, parsedArgs, {
        opts: parsedOpts,
        node: c,
        interpreters,
      });
    },

    argDefs,
    optDefs,
    completions: config.completions,
  };
}
