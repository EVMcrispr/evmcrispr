import type {
  Action,
  ArrayExpressionNode,
  BarewordNode,
  BatchContext,
  BlockExpressionNode,
  CallExpressionNode,
  CommandExpressionNode,
  DefValue,
  DestructurePatternNode,
  DestructureSlot,
  ErrorCaptureNode,
  EventCaptureNode,
  HelperFunctionNode,
  IModuleConstructor,
  ImportValue,
  InterpretOptions,
  LiteralExpressionNode,
  Module,
  ModuleContext,
  ModuleData,
  Node,
  NodeInterpreter,
  NodesInterpreter,
  NodesInterpreters,
  Param,
  VariableIdentifierNode,
} from "@evmcrispr/sdk";
import {
  abiBindingKey,
  type BindingsManager,
  BindingsSpace,
  CommandError,
  checkConfigAccess,
  ErrorException,
  ExpressionError,
  HaltExecution,
  HelperFunctionError,
  isBatchedAction,
  isTransactionAction,
  NodeError,
  NodeType,
  Num,
  parseConfigVarName,
  readConfigValue,
  resolveErrorCaptures,
  resolveEventCaptures,
  resolveHelper as resolveHelperFn,
  setBoolVarsFalse,
  timeUnits,
} from "@evmcrispr/sdk";
import type { Abi, Address, PublicClient } from "viem";
import { isAddress, parseAbiItem } from "viem";

const { ABI, USER, CACHE } = BindingsSpace;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Inputs the unified interpreter needs from the surrounding runtime.
 *
 * `resolveHelper` / `resolveCommand` / `resolveCallExpression` /
 * `resolveBlockExpression` are the seams between the pure interpreter and
 * its caller. Execution mode wires them to module-aware implementations
 * that throw on failure; prewarm/hover wire them to lighter-weight ones
 * that return `undefined` on cache miss.
 */
export interface InterpretCtx {
  /** Bindings available for variable lookups, ABI lookups, etc. */
  bindings: BindingsManager;

  /** Active chain id (0 if none). Used for helper cache keys. */
  chainId: number;
  /** Active client (undefined if none). Resolvers may consult it. */
  client: PublicClient | undefined;

  /** When set, helper invocations are memoized into this BindingsManager's
   *  CACHE space. Execution-mode contexts leave this undefined. */
  helperCache?: BindingsManager;

  /** `"throw"` (execution) propagates errors; `"undefined"` (prewarm/hover)
   *  swallows them and returns `undefined` from the interpreter. */
  onError: "throw" | "undefined";

  /** Resolve a helper invocation. Receives the original node and the live
   *  interpreters so the helper can recursively interpret its own args. */
  resolveHelper: (
    h: HelperFunctionNode,
    interpreters: NodesInterpreters,
    options?: any,
  ) => Promise<any>;

  /** Resolve a command invocation. Required for execution; omit in prewarm
   *  (the walker handles the small set of commands it cares about). */
  resolveCommand?: (
    c: CommandExpressionNode,
    interpreters: NodesInterpreters,
    options?: any,
  ) => Promise<any>;

  /** Resolve an inline contract `CallExpression`. Required for execution. */
  resolveCallExpression?: (
    n: CallExpressionNode,
    interpreters: NodesInterpreters,
    options?: any,
  ) => Promise<any>;

  /** Resolve a `BlockExpression`. Required when block bodies need to be
   *  interpreted (execution and DEF-style commands). */
  resolveBlockExpression?: (
    n: BlockExpressionNode,
    interpreters: NodesInterpreters,
    options?: any,
  ) => Promise<any>;

  /** Optional execution hook fired before a command is interpreted. */
  notifyLine?: (line: number | null) => void;
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

/** Stable string form of a value usable in a cache key. Mirrors what
 *  `String(...)` produced for the previous prewarm cache key, so values
 *  whose `toString()` is meaningful (e.g. `Num`) round-trip correctly. */
function stableStringify(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === "string") return v;
  if (
    typeof v === "number" ||
    typeof v === "boolean" ||
    typeof v === "bigint"
  ) {
    return String(v);
  }
  if (Array.isArray(v)) {
    return `[${v.map(stableStringify).join(",")}]`;
  }
  if (typeof v === "object") {
    if (typeof (v as { toString?: () => string }).toString === "function") {
      const s = (v as { toString: () => string }).toString();
      if (s !== "[object Object]") return s;
    }
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/** Build the cache key used by both the writer (`interpret` on a
 *  `HelperFunctionExpression`) and any reader (e.g. hover). Centralising
 *  this prevents writer/reader drift. */
export function helperCacheKey(
  name: string,
  resolvedArgs: unknown[],
  chainId: number,
  module?: string,
): string {
  const qualified = module ? `${module}:${name}` : name;
  return `helper:${chainId}:${qualified}:${resolvedArgs.map(stableStringify).join(":")}`;
}

// ---------------------------------------------------------------------------
// Synthetic-node helpers (used by prewarm/hover modes that pre-resolve args)
// ---------------------------------------------------------------------------

/** Build a `HelperFunctionNode` whose args are already-resolved values
 *  wrapped in `StringLiteral` nodes. Combine with `passthroughInterpreters`
 *  so the helper's `interpretNode(arg)` calls just unwrap the value. */
export function syntheticHelperNode(
  name: string,
  resolvedArgs: unknown[],
  module?: string,
): HelperFunctionNode {
  return {
    type: NodeType.HelperFunctionExpression,
    ...(module ? { module } : {}),
    name,
    args: resolvedArgs.map(
      (value) =>
        ({
          type: NodeType.StringLiteral,
          value,
        }) as any,
    ),
  };
}

/** Interpreters that just return a node's `value`. Used to feed
 *  pre-resolved synthetic nodes into helpers without re-interpreting. */
export const passthroughInterpreters: NodesInterpreters = {
  interpretNode: async (n: Node) => (n as any).value,
  interpretNodes: async (nodes: Node[]) => nodes.map((n) => (n as any).value),
};

// ---------------------------------------------------------------------------
// Interpreter
// ---------------------------------------------------------------------------

const {
  AddressLiteral,
  BoolLiteral,
  BytesLiteral,
  NumberLiteral,
  StringLiteral,
  ArrayExpression,
  DestructurePattern,
  BlockExpression,
  CommandExpression,
  CallExpression,
  HelperFunctionExpression,
  Bareword,
  VariableIdentifier,
} = NodeType;

/** Build a `{ interpretNode, interpretNodes }` pair closed over `ctx`. */
export function createInterpreter(ctx: InterpretCtx): NodesInterpreters {
  const interpretNode: NodeInterpreter = async (n, options) => {
    try {
      switch (n.type) {
        case AddressLiteral:
        case BoolLiteral:
        case BytesLiteral:
        case StringLiteral:
        case NumberLiteral:
          return interpretLiteral(n as LiteralExpressionNode);

        // NOTE: every async branch below uses `return await ...` so that
        // rejections from the awaited promise propagate to the outer
        // try/catch (a bare `return promise` would skip it).

        case ArrayExpression:
          return await interpretNodes((n as ArrayExpressionNode).elements);

        case DestructurePattern:
          return await interpretDestructurePattern(
            n as DestructurePatternNode,
            ctx,
          );

        case BlockExpression: {
          if (!ctx.resolveBlockExpression) {
            return onUnsupported(n, ctx, "BlockExpression");
          }
          return await ctx.resolveBlockExpression(
            n as BlockExpressionNode,
            { interpretNode, interpretNodes },
            options,
          );
        }

        case CallExpression: {
          if (!ctx.resolveCallExpression) {
            return onUnsupported(n, ctx, "CallExpression");
          }
          return await ctx.resolveCallExpression(
            n as CallExpressionNode,
            { interpretNode, interpretNodes },
            options,
          );
        }

        case CommandExpression: {
          if (!ctx.resolveCommand) {
            return onUnsupported(n, ctx, "CommandExpression");
          }
          ctx.notifyLine?.(n.loc?.start.line ?? null);
          return await ctx.resolveCommand(
            n as CommandExpressionNode,
            { interpretNode, interpretNodes },
            options,
          );
        }

        case HelperFunctionExpression:
          return await interpretHelperFunction(
            n as HelperFunctionNode,
            ctx,
            { interpretNode, interpretNodes },
            options,
          );

        case Bareword:
          return (n as BarewordNode).value;

        case VariableIdentifier:
          return interpretVariableIdentifier(
            n as VariableIdentifierNode,
            ctx,
            options,
          );

        default:
          return onUnsupported(n, ctx, n.type);
      }
    } catch (err) {
      if (ctx.onError === "throw") throw err;
      return undefined;
    }
  };

  const interpretNodes: NodesInterpreter = async (
    nodes,
    sequentially = false,
    options,
  ) => {
    if (sequentially) {
      const results: any[] = [];
      for (const n of nodes) {
        const r = await interpretNode(n, options);
        if (Array.isArray(r)) results.push(...r);
        else results.push(r);
      }
      return results;
    }
    return Promise.all(nodes.map((n) => interpretNode(n, options)));
  };

  return { interpretNode, interpretNodes };
}

function onUnsupported(n: Node, ctx: InterpretCtx, label: string): undefined {
  if (ctx.onError === "throw") {
    panic(n, `unknown ${label} node found`);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Per-node bodies (lifted unchanged from the legacy interpreter)
// ---------------------------------------------------------------------------

function interpretLiteral(n: LiteralExpressionNode): unknown {
  switch (n.type) {
    case NodeType.AddressLiteral:
    case NodeType.BoolLiteral:
    case NodeType.BytesLiteral:
    case NodeType.StringLiteral:
      return n.value;
    case NodeType.NumberLiteral: {
      let r = Num.fromDecimalString(String(n.value));
      if (n.power) {
        r = r.mul(Num(10n ** BigInt(n.power), 1n));
      }
      const seconds = Num.fromBigInt(BigInt(timeUnits[n.timeUnit ?? "s"]));
      r = n.perTime ? r.div(seconds) : r.mul(seconds);
      return r;
    }
    default:
      panic(n, "unknown literal expression node");
  }
}

async function interpretDestructurePattern(
  n: DestructurePatternNode,
  ctx: InterpretCtx,
): Promise<unknown[]> {
  const resolveSlot = async (slot: DestructureSlot): Promise<unknown> => {
    if (slot === null) return undefined;
    if (Array.isArray(slot)) return Promise.all(slot.map(resolveSlot));
    const binding = ctx.bindings.getBindingValue(slot, USER);
    if (binding !== undefined) return binding;
    panic(n, `${slot} not defined`);
  };
  return Promise.all(n.slots.map(resolveSlot));
}

function interpretVariableIdentifier(
  n: VariableIdentifierNode,
  ctx: InterpretCtx,
  options?: InterpretOptions,
): unknown {
  // Config variables (`$mod:key`): declared-key + access checks, then the
  // set value or the declared default.
  const cfg = parseConfigVarName(n.value);
  if (cfg) {
    try {
      checkConfigAccess(
        ctx.bindings,
        cfg.module,
        cfg.key,
        options?.origin,
        "read",
      );
      const value = readConfigValue(ctx.bindings, cfg.module, cfg.key, {
        chainId: ctx.chainId,
      });
      if (value !== undefined) return value;
    } catch (err) {
      panic(n, (err as Error).message);
    }
    panic(n, `${n.value} is not set and has no default`);
  }

  const binding = ctx.bindings.getBindingValue(n.value, USER);
  if (binding !== undefined) return binding;
  panic(n, `${n.value} not defined`);
}

async function interpretHelperFunction(
  h: HelperFunctionNode,
  ctx: InterpretCtx,
  interpreters: NodesInterpreters,
  options?: any,
): Promise<any> {
  // No cache: just dispatch. Execution path stays byte-identical.
  if (!ctx.helperCache)
    return await ctx.resolveHelper(h, interpreters, options);

  // Cached path: try to pre-resolve args. If any arg is unresolvable
  // (variable not bound, helper that needs RPC during prewarm, ...) we skip
  // the cache entirely and let the resolver decide what to do.
  let resolvedArgs: unknown[] | undefined;
  try {
    resolvedArgs = await interpreters.interpretNodes(h.args);
  } catch {
    return await ctx.resolveHelper(h, interpreters);
  }

  if (!resolvedArgs || resolvedArgs.some((v) => v === undefined)) {
    return await ctx.resolveHelper(h, interpreters);
  }

  const key = helperCacheKey(h.name, resolvedArgs, ctx.chainId, h.module);
  const cached = ctx.helperCache.getBindingValue(key, CACHE);
  if (cached !== undefined) return cached;

  // Invoke helper with the pre-resolved args via the synthetic-node trick so
  // the helper's `interpretNode(arg)` calls just unwrap them — no double
  // execution of arg sub-trees.
  const synthetic = syntheticHelperNode(h.name, resolvedArgs, h.module);
  const result = await ctx.resolveHelper(synthetic, passthroughInterpreters);
  if (result !== undefined) {
    ctx.helperCache.setBinding(key, result, CACHE, false, undefined, true);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Execution-mode resolver builders
// ---------------------------------------------------------------------------

/** Wrap interpreters so `batchContext` and `origin` implicitly propagate
 *  into every nested `interpretNode`/`interpretNodes` call (command args,
 *  helper args, nested blocks). Explicit per-call options still take
 *  precedence, so a nested batch-context opener (e.g. `connect` inside
 *  `batch`) or a module-def entry can set its own values. */
function withInheritedOptions(
  interpreters: NodesInterpreters,
  options: Pick<InterpretOptions, "batchContext" | "origin"> | undefined,
): NodesInterpreters {
  const batchContext = options?.batchContext;
  const origin = options?.origin;
  if (!batchContext && !origin) return interpreters;
  const inherited: Pick<InterpretOptions, "batchContext" | "origin"> = {};
  if (batchContext) inherited.batchContext = batchContext;
  if (origin) inherited.origin = origin;
  return {
    ...interpreters,
    interpretNode: (n, options) =>
      interpreters.interpretNode(n, { ...inherited, ...options }),
    interpretNodes: (nodes, sequentally, options) =>
      interpreters.interpretNodes(nodes, sequentally, {
        ...inherited,
        ...options,
      }),
    ...inherited,
  };
}

/** Inputs needed to resolve a helper / command / call against a live set
 *  of module instances (execution mode). All sources of state are getters
 *  so the resolvers see the latest `std` / modules across `interpret()`
 *  invocations (which rebuild `#std`). */
export interface ExecutionResolversInput {
  bindings: BindingsManager;
  std: () => Module;
  /** User-loaded modules (excluding std). */
  modules: () => Module[];
  /** Used by `CallExpression` to look up a client. Throws if none. */
  getClient: () => Promise<PublicClient>;
  /** Captures wrapper, fired after a command produces actions. */
  executeWithCaptures: (
    c: CommandExpressionNode,
    res: Action[] | void,
    actionCallback: ((action: Action) => Promise<unknown>) | undefined,
  ) => Promise<Action[] | void>;
}

/** Dispatch a helper/constant invocation against one specific module.
 *  Constants only apply to zero-arg invocations. */
async function dispatchHelperOnModule(
  m: Module,
  h: HelperFunctionNode,
  localName: string,
  interpreters: NodesInterpreters,
): Promise<any> {
  if (h.args.length === 0 && m.constants[localName] !== undefined) {
    return m.constants[localName];
  }
  if (!m.helpers[localName]) {
    panic(
      h,
      `module ${m.name} has no helper${h.args.length === 0 ? " or constant" : ""} named ${localName}`,
    );
  }
  // The module dispatches on the node's local name.
  const localNode = localName === h.name ? h : { ...h, name: localName };
  return m.interpretHelper(localNode, interpreters);
}

export function makeExecutionResolveHelper(
  input: Pick<ExecutionResolversInput, "bindings" | "std" | "modules">,
): InterpretCtx["resolveHelper"] {
  return async (h, rawInterpreters, options) => {
    const helperName = h.name;
    const std = input.std();
    const interpreters = withInheritedOptions(rawInterpreters, options);

    try {
      // Qualified: @mod:name — strict, no fallback.
      if (h.module) {
        const m =
          h.module === "std"
            ? std
            : input.modules().find((mod) => mod.name === h.module);
        if (!m) panic(h, `module ${h.module} not loaded`);
        return await dispatchHelperOnModule(m, h, helperName, interpreters);
      }

      // Unqualified: def → import → std prelude.
      const defHelper = input.bindings.getBindingValue(
        `@${helperName}`,
        BindingsSpace.DEF,
      ) as DefValue | undefined;

      if (defHelper && defHelper.kind === "helper") {
        return await defHelper.run(std, h, interpreters);
      }

      const imported = input.bindings.getBindingValue(
        `@${helperName}`,
        BindingsSpace.IMPORT,
      ) as ImportValue | undefined;

      if (imported) {
        const m = input.modules().find((mod) => mod.name === imported.module);
        if (!m) panic(h, `module ${imported.module} not loaded`);
        return await dispatchHelperOnModule(m, h, imported.name, interpreters);
      }

      if (h.args.length === 0 && std.constants[helperName] !== undefined) {
        return std.constants[helperName];
      }
      if (std.helpers[helperName]) {
        return await std.interpretHelper(h, interpreters);
      }

      panic(
        h,
        `helper @${helperName} not found — qualify it as @<module>:${helperName} or add it to the module's load import list`,
      );
    } catch (err) {
      if (err instanceof NodeError) throw err;
      panic(h, (err as Error).message);
    }
  };
}

export function makeExecutionResolveCommand(
  input: ExecutionResolversInput,
): InterpretCtx["resolveCommand"] {
  return async (c, rawInterpreters, options) => {
    const actionCallback: ((a: Action) => Promise<unknown>) | undefined =
      options?.actionCallback;
    const batchContext: BatchContext | undefined = options?.batchContext;
    const interpreters = withInheritedOptions(rawInterpreters, options);
    const std = input.std();

    // Once a command yields actions inside a batch, later chain-state reads
    // (non-batchable helpers, inline calls) become misleading — flag it.
    const trackBatchActions = (res: Action[] | void): Action[] | void => {
      if (batchContext && Array.isArray(res) && res.length > 0) {
        batchContext.hasActions = true;
      }
      return res;
    };

    if (!c.module) {
      const defCmd = input.bindings.getBindingValue(
        c.name,
        BindingsSpace.DEF,
      ) as DefValue | undefined;

      if (defCmd && defCmd.kind === "command") {
        let res: Action[] | void;
        try {
          res = await defCmd.run(std, c, {
            ...interpreters,
            actionCallback,
          });
          return trackBatchActions(
            await input.executeWithCaptures(c, res, actionCallback),
          );
        } catch (err) {
          if (err instanceof NodeError || err instanceof HaltExecution)
            throw err;
          panic(c, (err as Error).message);
        }
      }
    }

    let mod: Module = std;
    let localName = c.name;

    if (c.module) {
      // Qualified: mod:cmd — strict, no std fallback.
      if (c.module !== "std") {
        const m = input.modules().find((m) => m.name === c.module);
        if (!m) panic(c, `module ${c.module} not loaded`);
        mod = m;
      }
      if (!mod.commands[localName]) {
        panic(c, `module ${mod.name} has no command named ${localName}`);
      }
    } else {
      // Unqualified: import → std prelude (defs were handled above).
      const imported = input.bindings.getBindingValue(
        c.name,
        BindingsSpace.IMPORT,
      ) as ImportValue | undefined;

      if (imported?.kind === "command") {
        const m = input.modules().find((m) => m.name === imported.module);
        if (!m) panic(c, `module ${imported.module} not loaded`);
        mod = m;
        localName = imported.name;
      } else if (!std.commands[c.name]) {
        panic(
          c,
          `command ${c.name} not found — qualify it as <module>:${c.name} or add it to the module's load import list`,
        );
      }
    }

    try {
      // Modules dispatch on the node's name; renamed imports swap in the
      // module-local name.
      const localNode = localName === c.name ? c : { ...c, name: localName };
      const res = await mod.interpretCommand(localNode, {
        ...interpreters,
        actionCallback,
      });
      return trackBatchActions(
        await input.executeWithCaptures(c, res, actionCallback),
      );
    } catch (err) {
      if (err instanceof NodeError || err instanceof HaltExecution) throw err;
      panic(c, (err as Error).message);
    }
  };
}

function applyReturnLens(
  value: unknown,
  slots: DestructureSlot[],
  n: CallExpressionNode,
): unknown {
  const arr = Array.isArray(value) ? value : [value];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot === null) continue;
    if (slot === "$") return arr[i];
    if (Array.isArray(slot)) {
      if (i >= arr.length) {
        panic(
          n,
          `return destructure index ${i} out of bounds (length ${arr.length})`,
        );
      }
      return applyReturnLens(arr[i], slot, n);
    }
  }
  panic(n, "return destructure has no $ capture marker");
}

export function makeExecutionResolveCallExpression(
  input: Pick<ExecutionResolversInput, "bindings" | "getClient">,
): InterpretCtx["resolveCallExpression"] {
  return async (n, interpreters, options) => {
    // Inline calls are read-only `eth_call`s: inside a batch they run at
    // batch-build time and cannot observe earlier batch actions. Reads
    // before the first action are still sound, so they stay allowed.
    const batchContext: BatchContext | undefined = options?.batchContext;
    if (batchContext?.hasActions) {
      panic(
        n,
        `inline call ${n.target.value ?? "<target>"}::${n.method}() reads on-chain state at batch-build time and cannot observe the effects of earlier actions in the same ${batchContext.name}; read it into a variable with \`set\` at the beginning of the ${batchContext.name} and use the variable instead`,
      );
    }

    const [targetAddress, ...args] = await interpreters.interpretNodes([
      n.target,
      ...n.args,
    ]);

    if (!isAddress(targetAddress)) {
      panic(n, `invalid target. Expected an address, but got ${targetAddress}`);
    }

    let abi: Abi;
    if (n.inputTypes && n.outputTypes) {
      const sig = `function ${n.method}${n.inputTypes} external view returns ${n.outputTypes}`;
      abi = [parseAbiItem(sig) as Abi[number]];
    } else {
      const targetAbi = input.bindings.getBindingValue(targetAddress, ABI) as
        | Abi
        | undefined;
      if (!targetAbi) panic(n, `no ABI found for ${targetAddress}`);
      abi = targetAbi;
    }

    try {
      const client = await input.getClient();
      const res = await client.readContract({
        abi,
        functionName: n.method,
        args,
        address: targetAddress,
      });

      const result = n.returnDestructure
        ? applyReturnLens(res, n.returnDestructure, n)
        : res;

      return typeof result === "bigint" ? Num.fromBigInt(result) : result;
    } catch (err) {
      const err_ = err as Error;
      panic(
        n,
        `error occured whe calling ${n.target.value ?? targetAddress}: ${err_.message}`,
      );
    }
  };
}

/** Block expression resolver — execution and DEF callers both share this. */
export function makeResolveBlockExpression(
  bindings: BindingsManager,
): InterpretCtx["resolveBlockExpression"] {
  return async (n, interpreters, options = {}) => {
    bindings.enterScope();
    if (options.blockInitializer) await options.blockInitializer();
    const results = await interpreters.interpretNodes(n.body, true, options);
    bindings.exitScope();
    return results.filter((r) => !!r);
  };
}

// ---------------------------------------------------------------------------
// Captures (execution-only — kept here so Interpreter stays slim)
// ---------------------------------------------------------------------------

export interface CapturesInput {
  bindings: BindingsManager;
  getClient: () => Promise<PublicClient>;
  interpretNode: NodeInterpreter;
}

export function makeExecuteWithCaptures(
  input: CapturesInput,
): (
  c: CommandExpressionNode,
  res: Action[] | void,
  actionCallback: ((action: Action) => Promise<unknown>) | undefined,
) => Promise<Action[] | void> {
  const { bindings, getClient, interpretNode } = input;

  const tryLookupAbi = async (actions: Action[]): Promise<Abi | undefined> => {
    const first = actions[0];
    if (isTransactionAction(first) && first.to) {
      try {
        const chainId = await getClient().then((c) => c.getChainId());
        return bindings.getBindingValue(
          abiBindingKey(chainId, first.to),
          BindingsSpace.ABI,
        ) as Abi | undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  // Stamp the current chain id on any TransactionAction that doesn't
  // already carry one. Commands like `exec` build their actions via
  // `encodeAction` without knowing what chain they run on; the chain
  // is whatever the Interpreter's `#chainId` is at execution time. The
  // terminal executor uses `action.chainId` to pick the right chain
  // when sending a transaction (so the wallet can be on a different
  // chain than the one the script targets).
  //
  // Only stamp when an `actionCallback` is provided — i.e. the actions
  // are actually about to be executed against a wallet. Without a
  // callback, `interpret()` is being used for structural inspection
  // (tests, dry-runs, doc generation) where adding `chainId` would
  // bloat fixtures with no benefit.
  //
  // We let `getClient()` failures propagate: if the script `switch`ed to
  // a chain we don't know how to build a client for, surfacing the error
  // here is far more useful than letting the executor send the tx to
  // whatever chain the wallet happens to be on.
  const stampChainId = async (actions: Action[] | void): Promise<void> => {
    if (!actions || actions.length === 0) return;
    let chainId: number | undefined;
    for (const action of actions) {
      if (isTransactionAction(action) && action.chainId === undefined) {
        if (chainId === undefined) {
          chainId = await getClient().then((c) => c.getChainId());
        }
        action.chainId = chainId;
      }
    }
  };

  return async (c, res, actionCallback) => {
    const hasEventCaptures =
      c.eventCaptures != null && c.eventCaptures.length > 0;
    const hasErrorCaptures =
      c.errorCaptures != null && c.errorCaptures.length > 0;

    if (actionCallback) await stampChainId(res);

    if (!hasEventCaptures && !hasErrorCaptures) {
      if (res && actionCallback) {
        for (const action of res) {
          await actionCallback(action);
        }
      }
      return res;
    }

    if (!actionCallback) {
      throw new ErrorException(
        "captures require an execution context with transaction access",
      );
    }

    if (!res || res.length === 0) {
      throw new ErrorException(
        "captures require a command that produces transaction actions",
      );
    }

    for (const action of res) {
      if (!isTransactionAction(action) && !isBatchedAction(action)) {
        throw new ErrorException(
          "captures require transaction actions (not RPC, wallet, or terminal actions)",
        );
      }
    }

    if (hasEventCaptures) {
      const allLogs: any[] = [];
      for (const action of res) {
        const receipt = await actionCallback(action);
        if (receipt && typeof receipt === "object" && "logs" in receipt) {
          allLogs.push(...(receipt as { logs: any[] }).logs);
        }
      }

      const abi = await tryLookupAbi(res);
      await resolveEventCaptures(
        { logs: allLogs },
        abi,
        c.eventCaptures as EventCaptureNode[],
        bindings,
        interpretNode,
      );

      return [];
    }

    // Error captures
    const abi = await tryLookupAbi(res);
    try {
      for (const action of res) {
        await actionCallback(action);
      }
      const required = (c.errorCaptures as ErrorCaptureNode[]).find(
        (cap) => !cap.optional,
      );
      if (required) {
        throw new ErrorException(
          "expected transaction to revert but it succeeded",
        );
      }
      setBoolVarsFalse(c.errorCaptures as ErrorCaptureNode[], bindings);
      return [];
    } catch (err) {
      if (
        err instanceof ErrorException &&
        err.message === "expected transaction to revert but it succeeded"
      ) {
        throw err;
      }
      await resolveErrorCaptures(
        err,
        abi,
        c.errorCaptures as ErrorCaptureNode[],
        bindings,
      );
      return [];
    }
  };
}

// ---------------------------------------------------------------------------
// Prewarm / hover helper resolver
// ---------------------------------------------------------------------------

/** Inputs required to instantiate modules from the cache and dispatch a
 *  helper invocation against them. The interpreter's pre-resolved args
 *  arrive via the synthetic-node trick (see `syntheticHelperNode`). */
export interface PrewarmHelperInput {
  /** Cache of MODULE entries keyed by module name. */
  moduleCache: BindingsManager;
  /** Live USER bindings — passed straight through to instantiated modules. */
  bindings: BindingsManager;
  chainId: number;
  client: PublicClient | undefined;
  /** Pluggable module registry (loader by name). */
  registry: Map<string, () => Promise<{ default: IModuleConstructor }>>;
  /** Std constructor (special-cased to avoid going through the registry). */
  stdCtor: IModuleConstructor;
  /** Used to share an IPFS resolver across helper invocations. */
  buildModuleContext: (
    bindings: BindingsManager,
    chainId: number,
    client: PublicClient | undefined,
  ) => ModuleContext;
}

export function makePrewarmResolveHelper(
  input: PrewarmHelperInput,
): InterpretCtx["resolveHelper"] {
  return async (h, interpreters) => {
    // Same resolution order as execution: qualified module wins, then
    // import bindings recorded by the walk, then the std prelude.
    let ownerModuleName: string;
    let localName = h.name;

    if (h.module) {
      ownerModuleName = h.module;
    } else {
      const imported = input.bindings.getBindingValue(
        `@${h.name}`,
        BindingsSpace.IMPORT,
      ) as ImportValue | undefined;
      if (imported && imported.kind !== "command") {
        ownerModuleName = imported.module;
        localName = imported.name;
      } else {
        ownerModuleName = "std";
      }
    }

    const data = input.moduleCache.getBindingValue(
      ownerModuleName,
      BindingsSpace.MODULE,
    ) as ModuleData | undefined;

    if (!data?.helpers[localName]) {
      throw new ErrorException(
        `helper @${h.module ? `${h.module}:` : ""}${h.name} not found`,
      );
    }

    let Ctor: IModuleConstructor;
    if (ownerModuleName === "std") {
      Ctor = input.stdCtor;
    } else {
      const loader = input.registry.get(ownerModuleName);
      if (!loader) {
        throw new ErrorException(
          `module ${ownerModuleName} not found in registry`,
        );
      }
      const mod = await loader();
      Ctor = mod.default;
    }

    const ctx = input.buildModuleContext(
      input.bindings,
      input.chainId,
      input.client,
    );
    const instance = new Ctor(ctx);

    const localNode = localName === h.name ? h : { ...h, name: localName };
    const helper = await resolveHelperFn(instance.helpers[localName]);
    return helper(instance, localNode, interpreters) as Promise<Param>;
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function panic(n: Node, msg: string): never {
  switch (n.type) {
    case CommandExpression:
      throw new CommandError(n as CommandExpressionNode, msg);
    case HelperFunctionExpression:
      throw new HelperFunctionError(n as HelperFunctionNode, msg);
    case Bareword:
      throw new ExpressionError(n, msg, { name: "IdentifierError" });
    case VariableIdentifier:
      throw new ExpressionError(n, msg, { name: "VariableIdentifierError" });
    default:
      throw new ErrorException(msg);
  }
}

// Note: deliberately kept out of the public surface — `Address` is only
// imported to satisfy the type checker for the readContract call signature.
export type { Address };
