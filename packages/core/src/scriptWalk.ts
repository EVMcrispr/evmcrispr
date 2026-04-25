import type {
  BlockExpressionNode,
  CommandExpressionNode,
  CompletionContext,
  DestructurePatternNode,
  DestructureSlot,
  HelperResolver,
  ICommand,
  ModuleBinding,
  Node,
  NoNullableBinding,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  hasCommandsBlock,
  isBuiltinType,
  NodeType,
  resolveCommand,
} from "@evmcrispr/sdk";
import type { Chain, PublicClient, Transport } from "viem";
import { createPublicClient, http } from "viem";
import * as viemChains from "viem/chains";

import type { EvmlAST } from "./EvmlAST";
import { createInterpreter, type InterpretCtx } from "./interpreter";
import { parseScript } from "./parsers/script";

const { MODULE, USER } = BindingsSpace;

// ---------------------------------------------------------------------------
// Chain resolution for `switch` commands
// ---------------------------------------------------------------------------

const nameToChainId: Record<string, number> = Object.entries(viemChains).reduce(
  (acc, [name, chain]) => {
    acc[name] = (chain as Chain).id;
    return acc;
  },
  {} as Record<string, number>,
);

/** Resolve a `switch` command's argument to a chain ID, or return undefined. */
export function resolveSwitchChainId(
  commandNode: CommandExpressionNode,
  _bindings: BindingsManager,
): number | undefined {
  if (commandNode.name !== "switch") return undefined;
  const argNode = commandNode.args[0];
  if (!argNode) return undefined;

  const raw = argNode.value;
  if (raw == null) return undefined;

  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber > 0) return asNumber;
  if (typeof raw === "string") return nameToChainId[raw];
  return undefined;
}

/** Create a PublicClient for the given chain ID, or return undefined. */
export function clientForChain(
  chainId: number,
  transports?: Record<number, Transport>,
): PublicClient | undefined {
  const chain = Object.values(viemChains).find(
    (c) => (c as Chain).id === chainId,
  ) as Chain | undefined;
  if (!chain) return undefined;
  return createPublicClient({
    chain,
    transport: transports?.[chainId] ?? http(),
  }) as PublicClient;
}

// ---------------------------------------------------------------------------
// Module helpers
// ---------------------------------------------------------------------------

export async function resolveCommandNode(
  c: CommandExpressionNode,
  bindings: BindingsManager,
  parentModule: string,
): Promise<ICommand | undefined> {
  const moduleName = c.module ?? parentModule ?? "std";
  const moduleData = bindings.getBindingValue(moduleName, MODULE);
  if (!moduleData) return;

  const commandOrLoader = moduleData.commands[c.name];
  if (!commandOrLoader) return;
  return resolveCommand(commandOrLoader);
}

export function collectCustomTypes(bindings: BindingsManager) {
  const moduleBindings = bindings.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];

  const merged: Record<string, any> = {};
  for (const { value: mod } of moduleBindings) {
    if (mod.types) {
      Object.assign(merged, mod.types);
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Bindings seeding & node resolution
// ---------------------------------------------------------------------------

/** Seed the bindings manager with all cached module data and metadata.
 *  Safe to call multiple times -- skips modules already present. */
export function seedBindings(
  bindings: BindingsManager,
  cache: BindingsManager,
): void {
  const moduleBindings = cache.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];
  for (const { identifier, value } of moduleBindings) {
    if (!bindings.hasBinding(identifier, MODULE)) {
      bindings.setBinding(identifier, value, MODULE);
    }
  }

  const availableModulesJSON = cache.getMetadata("__available_modules__");
  if (availableModulesJSON) {
    bindings.setMetadata("__available_modules__", availableModulesJSON);
  }
}

/**
 * Create an async node resolver that closes over walk-local state.
 *
 * This is now a thin wrapper around the unified interpreter from
 * `./interpreter`. The interpreter recursively resolves any sub-tree
 * (literals, variables, binary expressions, arrays, helpers, ...) and
 * memoises helper results into `cache`'s CACHE space using the same
 * key shape that hover reads. Returns `undefined` for any node that
 * cannot be resolved, instead of throwing.
 */
export function createNodeResolver(
  bindings: BindingsManager,
  cache: BindingsManager,
  chainId: number,
  client: PublicClient | undefined,
  resolveHelper?: HelperResolver,
): (node: Node) => Promise<any> {
  const ctx: InterpretCtx = {
    bindings,
    chainId,
    client,
    helperCache: cache,
    onError: "undefined",
    resolveHelper: async (h, interpreters) => {
      if (!resolveHelper) return undefined;
      // The unified interpreter only invokes us with a synthetic
      // HelperFunctionNode whose args are pre-resolved StringLiteral nodes
      // (see `interpretHelperFunction` in ./interpreter). Read those values
      // back via the passthrough interpreter and forward to the legacy
      // HelperResolver. Pure helpers like `@num` don't need a client; we
      // pass `undefined` so they can still run during prewarm. Helpers
      // that do need a client will throw inside their `run` (when they
      // call `getClient()`) and we swallow it via `onError: "undefined"`.
      const resolvedArgs = await interpreters.interpretNodes(h.args);
      return resolveHelper(
        h.name,
        resolvedArgs.map(String),
        chainId,
        client as PublicClient,
        bindings,
      );
    },
  };
  const { interpretNode } = createInterpreter(ctx);
  return interpretNode;
}

/** Resolve a value node for the `set` command walk phase.  Falls back to
 *  storing the AST node itself when resolution fails. */
async function resolveValueNode(
  resolveNode: (node: Node) => Promise<any>,
  valueNode: Node,
): Promise<any> {
  const resolved = await resolveNode(valueNode);
  return resolved ?? valueNode;
}

/** Per-variable history of `(line, value)` entries collected while
 *  walking. Hover uses this to look up "what was `$x` at line N?" by
 *  picking the largest entry with `line <= N`. Entries are appended in
 *  walk order (top-to-bottom), so the array is already line-sorted. */
export type VariableHistory = Map<
  string,
  Array<{ line: number; value: unknown }>
>;

function recordHistory(
  history: VariableHistory | undefined,
  name: string,
  value: unknown,
  line: number,
): void {
  if (!history) return;
  const entries = history.get(name);
  if (entries) {
    entries.push({ line, value });
  } else {
    history.set(name, [{ line, value }]);
  }
}

/** Walk a destructure pattern and bind each named slot to the matching
 *  element of `value`. Mirrors `set`'s runtime `applyDestructure` but
 *  silently skips out-of-bounds slots so the prewarm walker can still
 *  produce useful (partial) bindings when the rhs didn't resolve. */
function applyDestructureToBindings(
  slots: DestructureSlot[],
  value: unknown,
  bindings: BindingsManager,
  history: VariableHistory | undefined,
  line: number,
): void {
  const arr = Array.isArray(value) ? value : [value];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot === null) continue;
    const elem = i < arr.length ? arr[i] : undefined;
    if (typeof slot === "string") {
      const slotValue = elem ?? slot;
      bindings.setBinding(slot, slotValue, USER, false, undefined, true);
      recordHistory(history, slot, slotValue, line);
    } else if (Array.isArray(slot)) {
      applyDestructureToBindings(slot, elem, bindings, history, line);
    }
  }
}

/** Seed every named slot in a destructure pattern with its own name
 *  (used when there is no rhs value to destructure). */
function seedDestructureSlots(
  slots: DestructureSlot[],
  bindings: BindingsManager,
): void {
  for (const s of slots) {
    if (typeof s === "string") {
      try {
        bindings.setBinding(s, s, USER);
      } catch {
        // binding already exists
      }
    } else if (Array.isArray(s)) {
      seedDestructureSlots(s, bindings);
    }
  }
}

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------

/** Walk a list of fully-typed command nodes and resolve any bindings they
 *  produce (variable → USER, custom type with resolve → arbitrary bindings).
 *
 *  When `history` is provided, each `set`-style variable assignment is also
 *  appended to it as `{ line, value }`. Hover uses this to render the value
 *  of `$x` as it stood at a given line (the live `bindings` only carries
 *  the *latest* value because variables are overwritten in place). */
export async function walkCommandsForBindings(
  commandNodes: CommandExpressionNode[],
  bindings: BindingsManager,
  cache: BindingsManager,
  client: PublicClient,
  chainId: number,
  resolveNode: (node: Node) => Promise<any>,
  history?: VariableHistory,
): Promise<void> {
  let parentModule = "std";

  for (const c of commandNodes) {
    if (hasCommandsBlock(c)) {
      parentModule = c.module ?? parentModule;
    }
    const commandModule = c.module ?? parentModule;

    const command = await resolveCommandNode(c, bindings, commandModule);
    if (!command) continue;

    const customTypes = collectCustomTypes(bindings);
    const cmdLine = c.loc?.start.line ?? 0;

    for (let i = 0; i < command.argDefs.length; i++) {
      const argDef = command.argDefs[i];
      const argNode = c.args[i];
      if (!argNode) continue;

      // Built-in "variable" type: auto-create USER binding
      if (argDef.type === "variable") {
        if (argNode.type === NodeType.DestructurePattern) {
          const slots = (argNode as DestructurePatternNode).slots;

          // For `set`, resolve the rhs and destructure into the slots so
          // each variable binds to its actual array element. Mirrors what
          // `set`'s runtime `applyDestructure` does.
          if (c.name === "set" && c.args[i + 1]) {
            const value = await resolveValueNode(resolveNode, c.args[i + 1]);
            applyDestructureToBindings(
              slots,
              value,
              bindings,
              history,
              cmdLine,
            );
          } else {
            // Non-set destructure (e.g. error/event capture): we don't
            // know the value, so seed each slot with its own name as a
            // best-effort placeholder.
            seedDestructureSlots(slots, bindings);
          }
          continue;
        }
        if (argNode.value) {
          let bindingValue: any = argNode.value;
          if (c.name === "set" && c.args[i + 1]) {
            bindingValue = await resolveValueNode(resolveNode, c.args[i + 1]);
          }
          // Mirror `set`'s runtime semantics (overwrite=true) so the
          // walker correctly reflects redefinitions like `set $x 1`
          // followed by `set $x 2`.
          bindings.setBinding(
            argNode.value,
            bindingValue,
            USER,
            false,
            undefined,
            true,
          );
          if (c.name === "set") {
            recordHistory(history, argNode.value, bindingValue, cmdLine);
          }
          continue;
        }
      }

      // Custom type with resolve: call it to produce bindings
      if (!Array.isArray(argDef.type) && !isBuiltinType(argDef.type)) {
        const customType = customTypes[argDef.type];
        if (customType?.resolve && argNode.value) {
          try {
            const ctx: CompletionContext = {
              argIndex: i,
              nodeArgs: c.args,
              bindings,
              position: { line: 0, col: 0 },
              client,
              chainId,
              cache,
              commandNode: c,
              resolveNode,
            };
            const newBindings = await customType.resolve(argNode.value, ctx);
            for (const b of newBindings) {
              try {
                bindings.setBinding(
                  b.identifier,
                  b.value,
                  b.type,
                  false,
                  undefined,
                  true,
                );
              } catch {
                // ignore duplicate binding errors
              }
            }
          } catch {
            // resolve failed, skip
          }
        }
      }
    }

    // If command has a block arg, enter a scope for the block body
    const blockArg = c.args.find((a) => a.type === NodeType.BlockExpression) as
      | BlockExpressionNode
      | undefined;
    if (blockArg) {
      bindings.enterScope(commandModule);
    }
  }
}

// ---------------------------------------------------------------------------
// Top-level convenience walker
// ---------------------------------------------------------------------------

export interface WalkResult {
  /** USER bindings (and any other bindings produced by custom-type resolvers)
   *  collected while walking the script. */
  bindings: BindingsManager;
  /** Effective chain id after applying all `switch` commands the walker saw. */
  chainId: number;
  /** Effective PublicClient after applying all `switch` commands the walker
   *  saw. Will differ from the input `client` when the script switched
   *  chains. `undefined` when no client was available at all. */
  client: PublicClient | undefined;
  /** Per-variable history of `(line, value)` entries observed by the walker.
   *  Used by hover to render the value of a variable as it stood at a given
   *  line, even when later `set`s have overwritten the live binding. */
  variableHistory: VariableHistory;
}

/**
 * Parse `script` and walk all `load` / `set` / `switch` commands up to and
 * including `upToLine`. Helper-function results are written into
 * `moduleCache`'s CACHE space (using the same key shape as completions),
 * which is what makes hover's address card visible for `@ens(...)` etc.
 *
 * `upToLine` is 1-indexed (matches `Position.line`).  Pass `Infinity` to walk
 * the entire script.
 *
 * Returns the per-walk USER bindings and the effective chainId after any
 * `switch` commands.  Failures during parsing or RPC lookup are swallowed —
 * the function always resolves so callers can use it as a best-effort
 * pre-warm step.
 */
export async function walkScript(
  script: string,
  upToLine: number,
  moduleCache: BindingsManager,
  client: PublicClient | undefined,
  resolveHelper: HelperResolver | undefined,
  transports: Record<number, Transport> | undefined,
): Promise<WalkResult> {
  const bindings = new BindingsManager();
  seedBindings(bindings, moduleCache);

  const variableHistory: VariableHistory = new Map();

  let ast: EvmlAST | undefined;
  try {
    ast = parseScript(script).ast;
  } catch {
    // Best-effort: try parsing only the lines up to `upToLine`.
    try {
      const lines = script.split("\n");
      const trimmed = lines
        .slice(0, Math.min(lines.length, upToLine))
        .join("\n");
      ast = parseScript(trimmed).ast;
    } catch {
      return { bindings, chainId: 0, client, variableHistory };
    }
  }

  const commandNodes: CommandExpressionNode[] = (
    ast?.getCommandsUntilLine(upToLine, ["load", "set", "switch"]) ?? []
  ).filter((c: CommandExpressionNode) => {
    const itHasCommandsBlock = hasCommandsBlock(c);
    const loc = c.loc;
    if (
      !itHasCommandsBlock ||
      (itHasCommandsBlock &&
        loc &&
        upToLine >= loc.start.line &&
        upToLine <= loc.end.line)
    ) {
      return true;
    }
    return false;
  });

  // Apply switch commands to find the effective client/chain.
  let effectiveClient = client;
  for (const c of commandNodes) {
    const switchedChainId = resolveSwitchChainId(c, bindings);
    if (switchedChainId != null) {
      const newClient = clientForChain(switchedChainId, transports);
      if (newClient) {
        effectiveClient = newClient;
      }
    }
  }

  let chainId = 0;
  try {
    chainId = (await effectiveClient?.getChainId()) ?? 0;
  } catch {
    // RPC unavailable — proceed with chainId 0
  }

  const resolveNode = createNodeResolver(
    bindings,
    moduleCache,
    chainId,
    effectiveClient,
    resolveHelper,
  );

  await walkCommandsForBindings(
    commandNodes,
    bindings,
    moduleCache,
    effectiveClient as PublicClient,
    chainId,
    resolveNode,
    variableHistory,
  );

  // Second pass: populate the helper cache for *all* commands the user
  // might hover over, not just the ones that produce bindings. Without
  // this, `print @token(DAI)` and similar helpers used as direct args
  // to non-binding commands never reach the cache and the hover card
  // can't show their resolved address. Helpers already evaluated
  // during `walkCommandsForBindings` are cache hits and re-add no
  // network cost.
  const allCommandNodes: CommandExpressionNode[] =
    ast?.getCommandsUntilLine(upToLine) ?? [];
  await prewarmHelperExpressions(allCommandNodes, resolveNode);

  return { bindings, chainId, client: effectiveClient, variableHistory };
}

/**
 * Walk every top-level argument of every command node and run it
 * through `resolveNode`. The unified interpreter's helper branch
 * memoises each successful evaluation into the CACHE space (keyed by
 * `helperCacheKey(name, args, chainId)`), which is exactly what
 * hover's `tryRenderAddressFromCache` reads.
 *
 * `resolveNode` is configured with `onError: "undefined"`, so failures
 * (e.g. helpers that need RPC, variables not in scope at this point,
 * unsupported node kinds like `BlockExpression`) silently no-op
 * instead of throwing.
 */
async function prewarmHelperExpressions(
  commandNodes: CommandExpressionNode[],
  resolveNode: (node: Node) => Promise<any>,
): Promise<void> {
  for (const c of commandNodes) {
    for (const arg of c.args) {
      try {
        await resolveNode(arg);
      } catch {
        // resolveNode already swallows; this is belt-and-suspenders.
      }
    }
  }
}
