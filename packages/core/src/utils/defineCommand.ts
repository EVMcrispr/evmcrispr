import type { Module } from "../Module";
import type {
  Action,
  CommandExpressionNode,
  ICommand,
  NodesInterpreters,
} from "../types";
import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  getOptValue,
} from "./args";
import {
  type ArgDef,
  defaultCompletionsFromSchema,
  type OptDef,
  validateArgType,
} from "./schema";

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
  buildCompletionItemsForArg?: ICommand<M>["buildCompletionItemsForArg"];
  runEagerExecution?: ICommand<M>["runEagerExecution"];
}

export function defineCommand<M extends Module>(
  config: CommandConfig<M>,
): ICommand<M> {
  const { args: argDefs, opts: optDefs = [], run } = config;

  const requiredCount = argDefs.filter((a) => !a.optional && !a.rest).length;
  const hasRest = argDefs.some((a) => a.rest);
  const hasOptional = argDefs.some((a) => a.optional);
  const totalFixed = argDefs.filter((a) => !a.rest).length;

  return {
    async run(module, c, interpreters) {
      // 1. Check argument length
      if (hasRest) {
        checkArgsLength(c, {
          type: ComparisonType.Greater,
          minValue: requiredCount,
        });
      } else if (hasOptional) {
        checkArgsLength(c, {
          type: ComparisonType.Between,
          minValue: requiredCount,
          maxValue: totalFixed,
        });
      } else {
        checkArgsLength(c, {
          type: ComparisonType.Equal,
          minValue: requiredCount,
        });
      }

      // 2. Check options
      if (optDefs.length > 0) {
        checkOpts(
          c,
          optDefs.map((o) => o.name),
        );
      }

      const { interpretNode, interpretNodes } = interpreters;

      // 3. Interpret arguments
      const parsedArgs: Record<string, any> = {};
      for (let i = 0; i < argDefs.length; i++) {
        const def = argDefs[i];
        if (def.skipInterpret) {
          // Skip auto-interpretation; command will use context.node.args
          continue;
        }
        if (def.rest) {
          const restNodes = c.args.slice(i);
          parsedArgs[def.name] = await interpretNodes(
            restNodes,
            false,
            def.interpretOptions,
          );
        } else if (c.args[i]) {
          parsedArgs[def.name] = await interpretNode(
            c.args[i],
            def.interpretOptions,
          );
        }
      }

      // 4. Validate argument types
      for (const def of argDefs) {
        const formatted = def.optional ? `[${def.name}]` : `<${def.name}>`;
        const value = parsedArgs[def.name];
        if (value !== undefined && !def.rest) {
          validateArgType(formatted, value, def.type);
        }
        // For rest args, validate each element
        if (def.rest && Array.isArray(value)) {
          if (def.type !== "any") {
            for (const item of value) {
              validateArgType(formatted, item, def.type);
            }
          }
        }
      }

      // 5. Interpret and validate options
      const parsedOpts: Record<string, any> = {};
      for (const optDef of optDefs) {
        const value = await getOptValue(c, optDef.name, interpretNode);
        if (value !== undefined) {
          validateArgType(`--${optDef.name}`, value, optDef.type);
          parsedOpts[optDef.name] = value;
        }
      }

      // 6. Call user's run function
      return run(module as M, parsedArgs, {
        opts: parsedOpts,
        node: c,
        interpreters,
      });
    },

    buildCompletionItemsForArg:
      config.buildCompletionItemsForArg ??
      defaultCompletionsFromSchema(argDefs),

    runEagerExecution: config.runEagerExecution ?? (async () => undefined),
  };
}
