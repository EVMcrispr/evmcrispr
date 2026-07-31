import { ErrorException, ExperimentalDisabledError } from "../errors";
import type { Module } from "../Module";
import type {
  CompletionOverrides,
  HelperFunction,
  HelperFunctionNode,
  Node,
  NodesInterpreters,
} from "../types";
import { BindingsSpace, NodeType } from "../types";
import { buildArgsLengthErrorMsg, coerceBoolean } from "./args";
import { computeCommandArity } from "./arity";
import type { Param } from "./encoders";
import {
  experimentalDisabledMessage,
  isExperimentalEnabled,
} from "./experimental";
import { partitionHelperArgs } from "./namedArgs";
import {
  type ArgDef,
  type ArgType,
  buildRuntimeResolver,
  coerceArgType,
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
  /** Whether this helper may be evaluated inside an atomic batch context
   *  (batch / connect / forward). Default true. Set to false for helpers
   *  that read mutable chain state: inside a batch they evaluate at
   *  batch-build time, so they can never observe the effects of earlier
   *  actions in the same batch. */
  batchable?: boolean;
  /** Only available when `VITE_PUBLIC_EXPERIMENTAL` is enabled. */
  experimental?: boolean;
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

  const fn: HelperFunction<M> = async (module, h, interpreters) => {
    if (config.experimental && !isExperimentalEnabled()) {
      throw new ExperimentalDisabledError(
        experimentalDisabledMessage("helper", config.name),
      );
    }

    // 0. Enforce batch compatibility: a non-batchable helper reads state
    // that the enclosing batch could change, but it would evaluate at
    // batch-build time and only ever see pre-batch state. Before the batch
    // collects its first action the read is still sound, so reading state
    // into variables at the beginning of the batch is allowed.
    if (interpreters.batchContext?.hasActions && config.batchable === false) {
      const { name } = interpreters.batchContext;
      throw new ErrorException(
        `helper @${config.name} reads on-chain state at batch-build time and cannot observe the effects of earlier actions in the same ${name}; read it into a variable with \`set\` at the beginning of the ${name} and use the variable instead`,
      );
    }

    // 1. Partition named args (`name:value`) from positional ones and
    // check the positional count. `computeCommandArity` applies the same
    // named-aware filtering the static analyzer uses, so the two agree.
    const { positional, named, issues } = partitionHelperArgs(h.args, argDefs);
    if (issues.length > 0) {
      throw new ErrorException(issues[0].message);
    }
    const arity = computeCommandArity(argDefs, h.args);
    if (arity.isError) {
      throw new ErrorException(
        buildArgsLengthErrorMsg(arity.effectiveArgCount, arity.comparison),
      );
    }

    const { interpretNode, interpretNodes } = interpreters;

    // 2. Interpret arguments by type. Positional args fill the
    // non-namedOnly defs in order; named args fill their def directly.
    let cursor = 0;
    const nodeFor = (def: (typeof argDefs)[number]): Node | undefined => {
      const namedNode = named.get(def.name);
      if (namedNode) return namedNode.value;
      if (def.namedOnly) return undefined;
      return positional[cursor++];
    };

    const parsedArgs: Record<string, any> = {};
    for (let i = 0; i < argDefs.length; i++) {
      const def = argDefs[i];

      if (def.type === "variable") {
        const node = nodeFor(def);
        if (!node || node.type !== NodeType.VariableIdentifier) {
          throw new ErrorException(`<${def.name}> must be a $variable`);
        }
        parsedArgs[def.name] = (node as any).value;
        continue;
      }

      if (def.type === "helper") {
        const cbNode = nodeFor(def);
        if (!cbNode || cbNode.type !== NodeType.HelperFunctionExpression) {
          throw new ErrorException(
            `<${def.name}> must be a helper reference like @helperName`,
          );
        }
        const helperNode = cbNode as unknown as HelperFunctionNode;
        parsedArgs[def.name] = async (...callArgs: Param[]) => {
          module.bindingsManager.enterScope();
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
        const restNodes = positional.slice(cursor);
        cursor = positional.length;
        parsedArgs[def.name] = await interpretNodes(restNodes);
      } else {
        const node = nodeFor(def);
        if (node) {
          parsedArgs[def.name] = await interpretNode(node);
        }
      }
    }

    // 3. Validate argument types
    for (let vi = 0; vi < argDefs.length; vi++) {
      const def = argDefs[vi];
      if (def.type === "helper") continue;
      const formatted = def.optional ? `[${def.name}]` : `<${def.name}>`;
      const value = parsedArgs[def.name];
      if (value !== undefined && !def.rest) {
        parsedArgs[def.name] = coerceArgType(value, def.type);
        validateArgType(
          formatted,
          parsedArgs[def.name],
          def.type,
          module.types,
        );
      }
      if (def.rest && Array.isArray(value)) {
        const resolver = buildRuntimeResolver(argDefs, vi);
        if (resolver) {
          for (let ri = 0; ri < value.length; ri++) {
            const resolved = resolver(parsedArgs, ri);
            if (resolved !== "any") {
              value[ri] = coerceArgType(value[ri], resolved);
              validateArgType(
                `${formatted}[${ri}]`,
                value[ri],
                resolved,
                module.types,
              );
            }
          }
        } else if (def.type !== "any") {
          for (let ri = 0; ri < value.length; ri++) {
            value[ri] = coerceArgType(value[ri], def.type);
            validateArgType(formatted, value[ri], def.type, module.types);
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
  if (config.batchable !== undefined) {
    (fn as any).batchable = config.batchable;
  }
  if (config.experimental !== undefined) {
    (fn as any).experimental = config.experimental;
  }

  return fn;
}
