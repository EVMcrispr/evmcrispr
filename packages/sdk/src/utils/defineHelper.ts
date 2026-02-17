import { ErrorException } from "../errors";
import type { Module } from "../Module";
import type {
  HelperFunction,
  HelperFunctionNode,
  NodesInterpreters,
} from "../types";
import { NodeType } from "../types";
import { ComparisonType, checkArgsLength } from "./args";
import { type ArgDef, type ArgType, validateArgType } from "./schema";

export interface HelperContext {
  node: HelperFunctionNode;
  interpreters: NodesInterpreters;
}

export interface HelperConfig<M extends Module> {
  name: string;
  /** Human-readable description shown in hover tooltips. */
  description?: string;
  returnType?: ArgType;
  args: ArgDef[];
  run(
    module: M,
    args: Record<string, any>,
    context: HelperContext,
  ): Promise<string>;
}

export function defineHelper<M extends Module>(
  config: HelperConfig<M>,
): HelperFunction<M> {
  const { args: argDefs, run } = config;

  const requiredCount = argDefs.filter((a) => !a.optional && !a.rest).length;
  const hasRest = argDefs.some((a) => a.rest);
  const hasOptional = argDefs.some((a) => a.optional);
  const totalFixed = argDefs.filter((a) => !a.rest).length;

  const fn: HelperFunction<M> = async (module, h, interpreters) => {
    // 1. Check argument length
    if (hasRest) {
      checkArgsLength(h, {
        type: ComparisonType.Greater,
        minValue: requiredCount,
      });
    } else if (hasOptional) {
      checkArgsLength(h, {
        type: ComparisonType.Between,
        minValue: requiredCount,
        maxValue: totalFixed,
      });
    } else {
      checkArgsLength(h, {
        type: ComparisonType.Equal,
        minValue: requiredCount,
      });
    }

    const { interpretNode, interpretNodes } = interpreters;

    // 2. Interpret arguments by type
    const parsedArgs: Record<string, any> = {};
    for (let i = 0; i < argDefs.length; i++) {
      const def = argDefs[i];

      if (def.type === "variable") {
        const node = h.args[i];
        if (!node || node.type !== NodeType.VariableIdentifier) {
          throw new ErrorException(`<${def.name}> must be a $variable`);
        }
        parsedArgs[def.name] = (node as any).value;
        continue;
      }

      // All other types: auto-interpret
      if (def.rest) {
        const restNodes = h.args.slice(i);
        parsedArgs[def.name] = await interpretNodes(restNodes);
      } else if (h.args[i]) {
        parsedArgs[def.name] = await interpretNode(h.args[i]);
      }
    }

    // 3. Validate argument types
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

    // 4. Call user's run function
    return run(module as M, parsedArgs, { node: h, interpreters });
  };

  if (config.description) {
    (fn as any).description = config.description;
  }

  return fn;
}
