import { ErrorException } from "../errors";
import type { Module } from "../Module";
import type {
  CompletionOverrides,
  HelperFunction,
  HelperFunctionNode,
  NodesInterpreters,
} from "../types";
import { BindingsSpace, NodeType } from "../types";
import { ComparisonType, checkArgsLength, coerceBoolean } from "./args";
import type { Param } from "./encoders";
import {
  type ArgDef,
  type ArgType,
  buildRuntimeResolver,
  validateArgType,
} from "./schema";

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
  /** Override type-driven completions for specific args by name. */
  completions?: CompletionOverrides;
  run(
    module: M,
    args: Record<string, any>,
    context: HelperContext,
  ): Promise<Param>;
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

      if (def.type === "helper") {
        const cbNode = h.args[i];
        if (!cbNode || cbNode.type !== NodeType.HelperFunctionExpression) {
          throw new ErrorException(
            `<${def.name}> must be a helper reference like @helperName`,
          );
        }
        const helperNode = cbNode as unknown as HelperFunctionNode;
        parsedArgs[def.name] = async (...callArgs: Param[]) => {
          module.bindingsManager.enterScope(config.name);
          try {
            const argNodes = callArgs.map((arg, idx) => {
              const tmpVar = `__cb_${idx}__`;
              module.bindingsManager.setBinding(
                tmpVar,
                arg,
                BindingsSpace.USER,
                false,
                undefined,
                true,
              );
              return { type: NodeType.VariableIdentifier, value: tmpVar };
            });
            const call = {
              ...helperNode,
              args: [...argNodes, ...helperNode.args],
            };
            return await interpretNode(call);
          } finally {
            module.bindingsManager.exitScope();
          }
        };
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
    for (let vi = 0; vi < argDefs.length; vi++) {
      const def = argDefs[vi];
      if (def.type === "helper") continue;
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

    // 4. Coerce bool args from string to native boolean
    for (const def of argDefs) {
      if (def.type === "bool" && typeof parsedArgs[def.name] === "string") {
        parsedArgs[def.name] = coerceBoolean(parsedArgs[def.name]);
      }
    }

    // 5. Call user's run function and validate return type
    const result = await run(module as M, parsedArgs, {
      node: h,
      interpreters,
    });

    if (config.returnType && config.returnType !== "any") {
      validateArgType(
        `@${config.name} return value`,
        result,
        config.returnType,
        module.types,
      );
    }

    return result;
  };

  if (config.description) {
    (fn as any).description = config.description;
  }

  return fn;
}
