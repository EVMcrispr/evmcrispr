import { ErrorException, ExperimentalDisabledError } from "../errors";
import type { Module } from "../Module";
import type { HelperCompile } from "../onchain/types";
import type {
  CompletionOverrides,
  DeclaredErrors,
  FailFn,
  HelperFunction,
  HelperFunctionNode,
  NoDeclaredErrors,
  Node,
  NodesInterpreters,
  NormalizedDeclaredErrorsOf,
} from "../types";
import { BindingsSpace, NodeType } from "../types";
import { buildArgsLengthErrorMsg, coerceBoolean } from "./args";
import { computeCommandArity } from "./arity";
import { createFail, normalizeDeclaredErrors } from "./declaredErrors";
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

export interface HelperContext<E extends DeclaredErrors = DeclaredErrors> {
  node: HelperFunctionNode;
  interpreters: NodesInterpreters;
  /** Refuse to return a value with one of the helper's declared errors,
   *  typed against their names and exact field shapes. Always throws. */
  fail: FailFn<E>;
}

/** A helper's run signature — the off-chain (composition-time) face. */
export type HelperRun<
  M extends Module,
  E extends DeclaredErrors = DeclaredErrors,
> = (
  module: M,
  args: Record<string, any>,
  context: HelperContext<E>,
) => Promise<Param>;

/**
 * Shared helper-config fields (everything but the `run`/`compile` faces).
 *
 * NOTE on field order: the codegen that builds `_generated.ts` scans each
 * helper's source, first match wins. Keep `name`, `description`,
 * `compileDescription`, `returnType` and `args` BEFORE `run` and `compile`
 * in every config literal, and avoid the literal substrings `name: "`,
 * `description: "`, `returnType: "` and `args: [` inside face bodies.
 */
export interface HelperConfigShared<
  M extends Module,
  E extends DeclaredErrors = NoDeclaredErrors,
> {
  /** Registration name. NEVER includes a trailing `!` (codegen enforces
   *  this) — the on-chain face of a helper is addressed as `@name!` and
   *  dispatched to `compile` automatically. */
  name: string;
  /**
   * What the helper means, in one sentence, for BOTH faces. Shown in
   * hover tooltips, completions and the generated reference page.
   *
   * It describes the helper, not the machinery: `@name!` evaluating
   * on-chain at assertion time is the `!` convention itself (documented
   * once in the EVML guide), and how a face compiles belongs to the
   * `## On-chain face` section of the helper's `.md`. Anything that is
   * genuinely `!`-only goes in `compileDescription`.
   */
  description?: string;
  /**
   * One short sentence appended to `description` for the `@name!` spelling
   * only. Reserved for a user-visible difference in the on-chain face:
   * what it accepts, what it can no longer do, or how it fails (truncates
   * a page, reverts on no match, dedups adjacent elements only). Never the
   * compilation strategy, and never an Operations function name.
   */
  compileDescription?: string;
  returnType?: ArgType;
  args: ArgDef[];
  /**
   * The named ways this helper refuses to return a value, raised with
   * `fail` in the `run` face and captured by scripts on the containing
   * command line. Validated and deeply frozen when the helper is defined.
   *
   * Keep the declarations in a separate metadata file (a `defineErrors`
   * call exported from it) and reference them here: the codegen scans a
   * helper's source for the first `description: "` / `args: [`, so an
   * error's own description must not appear inside this config literal.
   */
  errors?: E;
  /** Override type-driven completions for specific args by name. */
  completions?: CompletionOverrides;
  /** Whether this helper may be evaluated inside an atomic batch context
   *  (batch / connect / forward). Default true. Set to false for helpers
   *  that read mutable chain state: inside a batch they evaluate at
   *  batch-build time, so they can never observe the effects of earlier
   *  actions in the same batch. (Smart batches lift the gate: their
   *  compile-faced reads evaluate on-chain, in sequence.) */
  batchable?: boolean;
  /** Only available when `VITE_PUBLIC_EXPERIMENTAL` is enabled. */
  experimental?: boolean;
  /** Off-chain face: interpret the helper at composition time. Optional
   *  when `compile` is present (an on-chain-only helper). */
  run?: HelperRun<M, E>;
  /** On-chain face: compile the helper's raw AST node into an on-chain
   *  expression operand (`@name!` inside assert expressions and smart
   *  batches). Optional when `run` is present. Receives the raw node —
   *  argument interpretation is the face's own business. */
  compile?: HelperCompile;
}

/** Helper config: at least one of `run` (off-chain face) / `compile`
 *  (on-chain face) is required — type-enforced here, re-checked at
 *  runtime for untyped callers. */
export type HelperConfig<
  M extends Module,
  E extends DeclaredErrors = NoDeclaredErrors,
> =
  | (HelperConfigShared<M, E> & { run: HelperRun<M, E> })
  | (HelperConfigShared<M, E> & { compile: HelperCompile });

export function defineHelper<
  M extends Module,
  const E extends DeclaredErrors = NoDeclaredErrors,
>(config: HelperConfig<M, E>): HelperFunction<M, E> {
  const { args: argDefs, run, compile } = config;

  if (!run && !compile) {
    throw new ErrorException(
      `helper ${config.name} defines neither a \`run\` (off-chain) nor a \`compile\` (on-chain) face`,
    );
  }

  // Validated (and deeply frozen) once, when the helper is defined: a
  // malformed declaration must not wait for a failing run to be noticed.
  // The on-chain face gets no `fail`: a compilation failure is not
  // catchable, so it has no declared-refusal channel.
  const label = `helper "@${config.name}"`;
  const errors = normalizeDeclaredErrors(
    config.errors ?? {},
    label,
  ) as NormalizedDeclaredErrorsOf<E>;
  // The normalized block carries the same names and field shapes as `E`
  // (it only fills `fields` in), so it types `fail` exactly. It is also
  // the block `normalizeDeclaredErrors` already validated, which
  // `createFail` re-normalizes for free.
  const fail = createFail<E>(errors as unknown as E, label);

  const fn: HelperFunction<M, E> = async (module, h, interpreters) => {
    if (config.experimental && !isExperimentalEnabled()) {
      throw new ExperimentalDisabledError(
        experimentalDisabledMessage("helper", config.name),
      );
    }

    // 0. On-chain faces never run here: a `!`-named node reaches the
    // wrapper only outside an on-chain expression (the compilers intercept
    // them first), and a helper without a run face has nothing to execute.
    // Prewarm/hover/completions call helpers through synthetic nodes with
    // no batch context, so this check must stay at the top.
    if (h.name.endsWith("!") || !run) {
      throw new ErrorException(
        `@${h.name} evaluates on-chain and is only valid inside an on-chain expression`,
      );
    }

    // 1. Enforce batch compatibility: a non-batchable helper reads state
    // that the enclosing batch could change, but it would evaluate at
    // batch-build time and only ever see pre-batch state. Before the batch
    // collects its first action the read is still sound, so reading state
    // into variables at the beginning of the batch is allowed. Explicit bang helpers compile separately; ordinary reads keep this gate
    // inside smart batches too.
    if (interpreters.batchContext?.hasActions && config.batchable === false) {
      const { name } = interpreters.batchContext;
      throw new ErrorException(
        `helper @${config.name} reads on-chain state at batch-build time and cannot observe the effects of earlier actions in the same ${name}; read it into a variable with \`set\` at the beginning of the ${name} and use the variable instead`,
      );
    }

    // 2. Partition named args (`name:value`) from positional ones and
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

    // 3. Interpret arguments by type. Positional args fill the
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

      // A lazy arg reaches `run` unevaluated: the helper interprets it
      // itself, which is the only way to observe the evaluation failing
      // (see ArgDef.lazy). Type validation below is skipped for the same
      // reason — the value it would check does not exist yet. A lazy REST
      // arg takes every remaining node raw: helpers that interpret a token
      // stream themselves (@ifElse's ternary) get the whole tail.
      if (def.lazy) {
        if (def.rest) {
          parsedArgs[def.name] = positional.slice(cursor);
          cursor = positional.length;
        } else {
          parsedArgs[def.name] = nodeFor(def);
        }
        continue;
      }

      // A union including "helper" accepts EITHER a helper reference or an
      // ordinary value: the reference becomes a callable below, anything
      // else falls through to the normal coercion. `@sort` uses it to take
      // a comparator or a plain direction in the same slot.
      const acceptsHelper = Array.isArray(def.type)
        ? def.type.includes("helper")
        : def.type === "helper";
      const helperOptional = acceptsHelper && Array.isArray(def.type);

      if (acceptsHelper) {
        const cbNode = nodeFor(def);
        if (!cbNode && def.optional) {
          parsedArgs[def.name] = undefined;
          continue;
        }
        if (
          helperOptional &&
          (!cbNode || cbNode.type !== NodeType.HelperFunctionExpression)
        ) {
          // Not a reference. `nodeFor` already consumed it, so interpret it
          // as an ordinary value and move on.
          parsedArgs[def.name] = cbNode
            ? await interpretNode(cbNode)
            : undefined;
          continue;
        }
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

    // 4. Validate argument types
    for (let vi = 0; vi < argDefs.length; vi++) {
      const def = argDefs[vi];
      if (
        def.lazy ||
        def.type === "helper" ||
        (Array.isArray(def.type) && def.type.includes("helper"))
      )
        continue;
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

    // 5. Coerce bool args from string to native boolean
    for (const def of argDefs) {
      if (def.type === "bool" && typeof parsedArgs[def.name] === "string") {
        parsedArgs[def.name] = coerceBoolean(parsedArgs[def.name]);
      }
    }

    // 6. Call the run face and validate return type
    const result = await run(module as M, parsedArgs, {
      node: h,
      interpreters,
      fail,
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

  fn.errors = errors;
  if (config.description) {
    (fn as any).description = config.description;
  }
  if (config.compileDescription) {
    (fn as any).compileDescription = config.compileDescription;
  }
  if (config.batchable !== undefined) {
    (fn as any).batchable = config.batchable;
  }
  if (config.experimental !== undefined) {
    (fn as any).experimental = config.experimental;
  }
  if (compile) {
    // The on-chain face travels on the wrapper so the compilers (see
    // sdk/onchain/dispatch.ts) can pick it off the resolved helper.
    (fn as any).compile = compile;
    (fn as any).onchain = true;
  }

  return fn;
}
