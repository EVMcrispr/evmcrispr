import { ErrorException, ExperimentalDisabledError } from "../errors";
import type { Module } from "../Module";
import type {
  Action,
  BatchableSpec,
  BlockExpressionNode,
  CommandExpressionNode,
  CompletionOverrides,
  DeclaredErrors,
  FailFn,
  HelperFunctionNode,
  ICommand,
  NoDeclaredErrors,
  NodesInterpreters,
  NormalizedDeclaredErrorsOf,
} from "../types";
import { NodeType } from "../types";
import { isSpecialArgType as isSpecialType } from "./argAlignment";
import {
  buildArgsLengthErrorMsg,
  checkOpts,
  coerceBoolean,
  getOptValue,
} from "./args";
import { computeCommandArity, prepareCommandArity } from "./arity";
import { createFail, normalizeDeclaredErrors } from "./declaredErrors";
import {
  experimentalDisabledMessage,
  isExperimentalEnabled,
} from "./experimental";
import {
  type ArgDef,
  type ArgType,
  buildRuntimeResolver,
  coerceArgType,
  type OptDef,
  validateArgType,
} from "./schema";

function typeIncludes(type: ArgType, target: string): boolean {
  return Array.isArray(type) ? type.includes(target) : type === target;
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
      if (!def.allowConfig && String(astNode.value).includes(":")) {
        throw new ErrorException(
          `${astNode.value}: config variables can only be assigned with set`,
        );
      }
      return { ok: true, value: astNode.value };
    }
    if (astNode?.type === NodeType.DestructurePattern) {
      return { ok: true, value: astNode.slots };
    }
  }

  return { ok: false };
}

export interface CommandContext<E extends DeclaredErrors = DeclaredErrors> {
  opts: Record<string, any>;
  /** Refuse to run with one of the command's declared errors, typed
   *  against their names and exact field shapes. Always throws. */
  fail: FailFn<E>;
  node: CommandExpressionNode;
  interpreters: NodesInterpreters;
}

export interface CommandConfig<
  M extends Module,
  E extends DeclaredErrors = NoDeclaredErrors,
> {
  compile?: import("../onchain/smart-types").CommandCompile;
  createsSmartBatchContext?: boolean;
  smartSupport?: import("../types").ICommand["smartSupport"];
  primaryCall?: number;
  name: string;
  /** Human-readable description shown in hover tooltips. */
  description?: string;
  args: ArgDef[];
  opts?: OptDef[];
  /**
   * The named ways this command refuses to run, raised with `fail` and
   * captured by scripts with `-?!> Name [$field]`. Validated and deeply
   * frozen when the command is defined.
   *
   * Keep the declarations in a separate metadata file (a `defineErrors`
   * call exported from it) and reference them here: the codegen scans a
   * command's source for the first `description: "` / `args: [`, so an
   * error's own description must not appear inside this config literal.
   */
  errors?: E;
  run(
    module: M,
    args: Record<string, any>,
    context: CommandContext<E>,
  ): Promise<Action[] | void>;
  /** Override type-driven completions for specific args or opts by name.
   *  Keys are matched against arg names first, then opt names. */
  completions?: CompletionOverrides;
  /** Whether this command may run inside an atomic batch context
   *  (batch / connect / forward). Default true. A function receives the
   *  parsed args and opts; return true, false, or a string reason. */
  batchable?: BatchableSpec;
  /** Whether this command opens an atomic batch context around its block
   *  body (`batch`, `connect`, `forward`). Commands nested in that block
   *  with `batchable: false` are rejected. Used by the static analyzer to
   *  find non-batchable commands without executing the script. */
  createsBatchContext?: boolean;
  /** Only available when `VITE_PUBLIC_EXPERIMENTAL` is enabled. */
  experimental?: boolean;
}

export function defineCommand<
  M extends Module,
  const E extends DeclaredErrors = NoDeclaredErrors,
>(config: CommandConfig<M, E>): ICommand<M, E> {
  const { args: argDefs, opts: optDefs = [], run } = config;

  const arityMeta = prepareCommandArity(argDefs);

  // Validated (and deeply frozen) once, when the command is defined: a
  // malformed declaration must not wait for a failing run to be noticed.
  const label = `command "${config.name}"`;
  const errors = normalizeDeclaredErrors(
    config.errors ?? {},
    label,
  ) as NormalizedDeclaredErrorsOf<E>;
  // The normalized block carries the same names and field shapes as `E`
  // (it only fills `fields` in), so it types `fail` exactly. It is also
  // the block `normalizeDeclaredErrors` already validated, which
  // `createFail` re-normalizes for free.
  const fail = createFail<E>(errors as unknown as E, label);

  return {
    async run(module, c, interpreters) {
      if (config.experimental && !isExperimentalEnabled()) {
        throw new ExperimentalDisabledError(
          experimentalDisabledMessage("command", config.name),
        );
      }

      const smartState = interpreters.batchContext?.smartState;
      if (c.returnCapture && !smartState) {
        throw new ErrorException(
          "-> [...] return capture is only valid inside a smart batch",
        );
      }
      if (smartState && config.smartSupport?.kind === "incompatible") {
        throw new ErrorException(
          config.smartSupport.reason ??
            `${config.name} cannot run inside a smart batch`,
        );
      }
      const { interpretNode } = interpreters;
      const smartApi = smartState
        ? await import("../onchain/smart")
        : undefined;
      const smartTypes = smartState
        ? await import("../onchain/smart-types")
        : undefined;
      const compileCtx = smartState
        ? (await import("../onchain/assertion")).defaultCompileCtx(
            module,
            interpreters,
          )
        : undefined;
      const fieldValue = async (
        node: import("../types").Node,
        runtime = false,
      ) => {
        if (smartApi && runtime)
          return smartApi.interpretSmartValue(compileCtx!, node);
        const value = await interpretNode(node);
        if (smartTypes?.hasRuntimeValue(value))
          throw new ErrorException(
            "this field requires a build-time value; runtime outputs need a supported command field or an on-chain helper (!)",
          );
        return value;
      };

      // 1-2. Extract trailing block(s) and check argument length. Shared with
      // the static analyzer via `computeCommandArity` so both agree on arity.
      const arity = computeCommandArity(argDefs, c.args, arityMeta);
      const astArgs = arity.astArgs;
      const blockNodes = arity.blockNodes;

      if (arity.missingBlockName) {
        throw new ErrorException(
          `<${arity.missingBlockName}> must be a block expression`,
        );
      }

      if (arity.isError) {
        throw new ErrorException(
          buildArgsLengthErrorMsg(arity.effectiveArgCount, arity.comparison),
        );
      }

      // 3. Check options. Experimental opts stay in the valid list so the
      // dedicated error below fires instead of "unknown option".
      if (!isExperimentalEnabled()) {
        const usedExperimental = optDefs.find(
          (o) => o.experimental && c.opts?.some((op) => op.name === o.name),
        );
        if (usedExperimental) {
          throw new ExperimentalDisabledError(
            experimentalDisabledMessage("option", usedExperimental.name),
          );
        }
      }
      if (optDefs.length > 0) {
        checkOpts(
          c,
          optDefs.map((o) => o.name),
        );
      }

      if (
        smartState &&
        config.compile &&
        typeof config.batchable !== "function"
      ) {
        if (config.batchable === false)
          throw new ErrorException(
            `command "${config.name}" cannot be used inside ${interpreters.batchContext!.name}`,
          );
        const result = await smartApi!.withSmartCompileContext(
          module,
          compileCtx!,
          () => config.compile!({ ...compileCtx!, batch: smartState }, c),
        );
        await smartState.append(module, c, result);
        if (smartState.plan.steps.length)
          interpreters.batchContext!.hasActions = true;
        return [];
      }

      // 4. Interpret arguments by type. A cursor walks astArgs so optional
      // special-typed defs whose node doesn't match are skipped without
      // consuming it, letting later defs shift left (e.g.
      // `loop [variable] <connector> <value> <block>`).
      const parsedArgs: Record<string, any> = {};
      let blockIdx = 0;
      let cursor = 0;
      for (let i = 0; i < argDefs.length; i++) {
        const def = argDefs[i];

        if (isSpecialType(def.type)) {
          const blockForThis = typeIncludes(def.type, "block")
            ? blockNodes[blockIdx++]
            : undefined;
          const extracted = extractSpecialArg(
            def,
            astArgs[cursor],
            blockForThis,
          );
          if (extracted.ok) {
            parsedArgs[def.name] = extracted.value;
            const fromBlock =
              blockForThis !== undefined && extracted.value === blockForThis;
            if (!fromBlock) cursor++;
            continue;
          }
          if (def.optional) continue;
          if (!Array.isArray(def.type)) {
            const typeLabel = def.type === "variable" ? "$variable" : def.type;
            throw new ErrorException(`<${def.name}> must be a ${typeLabel}`);
          }
        }

        // All other types (or unmatched union fallthrough): auto-interpret
        if (def.rest) {
          const restNodes = astArgs.slice(cursor);
          parsedArgs[def.name] = await Promise.all(
            restNodes.map((node) => fieldValue(node, def.runtime)),
          );
          cursor = astArgs.length;
        } else if (astArgs[cursor]) {
          parsedArgs[def.name] = await fieldValue(astArgs[cursor], def.runtime);
          cursor++;
        }
      }

      if (cursor < astArgs.length) {
        throw new ErrorException(
          `too many arguments: expected at most ${cursor}, got ${astArgs.length}`,
        );
      }

      if (smartState) {
        for (const def of argDefs) {
          if (
            def.runtime &&
            def.snapshot &&
            smartTypes!.isRuntimeValue(parsedArgs[def.name])
          )
            parsedArgs[def.name] = await smartState.snapshot(
              compileCtx!,
              parsedArgs[def.name],
            );
        }
      }
      // 5. Validate argument types (skip special types)
      for (let vi = 0; vi < argDefs.length; vi++) {
        const def = argDefs[vi];
        if (isSpecialType(def.type)) continue;
        const formatted = def.optional ? `[${def.name}]` : `<${def.name}>`;
        const value = parsedArgs[def.name];
        if (def.runtime && smartTypes?.hasRuntimeValue(value)) continue;
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

      // 6. Coerce bool args from string to native boolean
      for (const def of argDefs) {
        if (def.type === "bool" && typeof parsedArgs[def.name] === "string") {
          parsedArgs[def.name] = coerceBoolean(parsedArgs[def.name]);
        }
      }

      // 7. Interpret and validate options
      const parsedOpts: Record<string, any> = {};
      for (const optDef of optDefs) {
        if (optDef.type === "variable") {
          const option = c.opts.find((o) => o.name === optDef.name);
          if (!option) continue;
          if (option.value.type !== NodeType.VariableIdentifier) {
            throw new ErrorException(`--${optDef.name} requires a $variable`);
          }
          const extracted = extractSpecialArg(
            { name: optDef.name, type: "variable" },
            option.value,
            undefined,
          );
          if (!extracted.ok)
            throw new ErrorException(`--${optDef.name} requires a $variable`);
          parsedOpts[optDef.name] = extracted.value;
          continue;
        }
        const value = await getOptValue(c, optDef.name, (node) =>
          fieldValue(node, optDef.runtime),
        );
        if (optDef.runtime && smartTypes?.hasRuntimeValue(value)) {
          parsedOpts[optDef.name] = value;
          continue;
        }
        if (value !== undefined) {
          const coerced = coerceArgType(value, optDef.type);
          validateArgType(
            `--${optDef.name}`,
            coerced,
            optDef.type,
            module.types,
          );
          parsedOpts[optDef.name] = coerced;
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

      if (smartState && config.compile) {
        const result = await smartApi!.withSmartCompileContext(
          module,
          compileCtx!,
          () => config.compile!({ ...compileCtx!, batch: smartState }, c),
        );
        await smartState.append(module, c, result);
        if (smartState.plan.steps.length)
          interpreters.batchContext!.hasActions = true;
        return [];
      }

      // 9. Call user's run function
      // The smart `compile` faces above get no `fail`: a compile-only
      // step has no catchable declared refusal, the same rule as helper
      // compile faces.
      const invoke = () =>
        run(module as M, parsedArgs, {
          opts: parsedOpts,
          fail,
          node: c,
          interpreters,
        });
      const result = smartApi
        ? await smartApi.withSmartCompileContext(module, compileCtx!, invoke)
        : await invoke();
      if (smartState) {
        await smartState.append(module, c, {
          actions: result ?? [],
          primaryCall: config.primaryCall,
        });
        if (smartState.plan.steps.length)
          interpreters.batchContext!.hasActions = true;
        return [];
      }
      return result;
    },

    compile: config.compile,
    createsSmartBatchContext: config.createsSmartBatchContext,
    smartSupport: config.smartSupport,
    argDefs,
    optDefs,
    errors,
    completions: config.completions,
    description: config.description,
    batchable: config.batchable,
    createsBatchContext: config.createsBatchContext,
    experimental: config.experimental,
  };
}
