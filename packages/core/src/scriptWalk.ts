import type {
  BarewordNode,
  BlockExpressionNode,
  CommandExpressionNode,
  CompletionContext,
  DestructurePatternNode,
  DestructureSlot,
  ErrorCaptureNode,
  EventCaptureNode,
  HelperResolver,
  ICommand,
  ModuleBinding,
  Node,
  NoNullableBinding,
  NumericLiteralNode,
  StringLiteralNode,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  hasCommandsBlock,
  isBuiltinType,
  isNum,
  NodeType,
  resolveCommand,
} from "@evmcrispr/sdk";
import type { Chain, PublicClient, Transport } from "viem";
import { createPublicClient, http } from "viem";
import * as viemChains from "viem/chains";
import { mainnet } from "viem/chains";

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

function chainIdFromStaticValue(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (isNum(raw)) {
    const n = Number(String(raw));
    if (Number.isInteger(n) && n > 0) return n;
  }
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return n;
    return nameToChainId[raw];
  }
  return undefined;
}

/** Rhs literals we reuse for `$var` lookups when pre-warming `switch`. */
function extractLiteralSetRhs(node: Node): string | number | undefined {
  switch (node.type) {
    case NodeType.Bareword:
      return (node as BarewordNode).value;
    case NodeType.StringLiteral:
      return (node as StringLiteralNode).value;
    case NodeType.NumberLiteral: {
      const nl = node as NumericLiteralNode;
      if (nl.power != null || (nl.timeUnit != null && nl.timeUnit !== "s")) {
        return undefined;
      }
      const v = Number(String(nl.value));
      return Number.isInteger(v) && v > 0 ? v : undefined;
    }
    default:
      return undefined;
  }
}

/** Record literal `std:set $name <rhs>` for static chain prep. */
function tryApplyLiteralStdSet(
  bindings: BindingsManager,
  c: CommandExpressionNode,
): void {
  if ((c.module ?? "std") !== "std" || c.name !== "set") return;
  const lhs = c.args[0];
  const rhs = c.args[1];
  if (!lhs || lhs.type !== NodeType.VariableIdentifier) return;
  if (!rhs) return;
  const lit = extractLiteralSetRhs(rhs);
  if (lit === undefined) return;
  const bindingValue: string = typeof lit === "number" ? String(lit) : lit;
  bindings.setBinding(lhs.value, bindingValue, USER, false, undefined, true);
}

/** Resolve a `switch` command's argument to a chain ID, or return undefined.
 *  Honors USER bindings produced by preceding literal `std:set` commands when
 *  the argument is `$variable`.
 */
export function resolveSwitchChainId(
  commandNode: CommandExpressionNode,
  bindings: BindingsManager,
): number | undefined {
  if (commandNode.name !== "switch") return undefined;
  const argNode = commandNode.args[0];
  if (!argNode) return undefined;

  if (argNode.type === NodeType.VariableIdentifier) {
    const key = argNode.value;
    const bound =
      bindings.getBindingValue(key, USER) ??
      (key.startsWith("$")
        ? undefined
        : bindings.getBindingValue(`$${key}`, USER));
    return chainIdFromStaticValue(bound);
  }

  const raw = argNode.value;
  if (raw == null) return undefined;

  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber > 0) return asNumber;
  if (typeof raw === "string") return nameToChainId[raw];
  return undefined;
}

/** Walk `EvmlAST.getAllCommandsUntilLine` order: apply literal `set`s,
 * collect every resolved `switch` chain id for wallet pre-add / prep.
 * When the first AST body stmt is `switch`, `leadingSwitchChainId`
 * resolves it with literal `std:set`s that appear earlier in DFS pre-order.
 */
export function collectPreparedSwitchTargets(
  allCommands: CommandExpressionNode[],
  firstBodyStatement?: CommandExpressionNode,
): {
  orderedSwitchChainIds: number[];
  leadingSwitchChainId: number | undefined;
} {
  const bindings = new BindingsManager();
  const orderedSwitchChainIds: number[] = [];
  let leadingSwitchChainId: number | undefined;

  for (const c of allCommands) {
    tryApplyLiteralStdSet(bindings, c);

    if (firstBodyStatement?.name === "switch" && c === firstBodyStatement) {
      leadingSwitchChainId = resolveSwitchChainId(c, bindings);
    }

    if (c.name === "switch" && (c.module ?? "std") === "std") {
      const id = resolveSwitchChainId(c, bindings);
      if (id !== undefined) orderedSwitchChainIds.push(id);
    }
  }

  return { orderedSwitchChainIds, leadingSwitchChainId };
}

/** Pretty token accepted by `switch` for messaging (decimal id **or**
 * a viem `chains/*` export name). Pick the shortest alias so errors like
 * "start with switch gnosis" match what the DSL parser resolves, unlike
 * wagmi `.name` display strings ("OP Mainnet", "Gnosis", …). Unknown
 * ids fall back to decimal `String(chainId)` which `switch` also accepts.
 */
export function switchArgForChainId(chainId: number): string {
  const aliases: string[] = [];
  for (const [exportName, id] of Object.entries(nameToChainId)) {
    if (id === chainId) aliases.push(exportName);
  }
  if (aliases.length === 0) return String(chainId);
  aliases.sort((a, b) => {
    const d = a.length - b.length;
    return d !== 0 ? d : a.localeCompare(b);
  });
  return aliases[0];
}

/** Stable key for callers that omit `transports` (distinct from `{}`). */
const NO_TRANSPORTS_SENTINEL: Record<number, Transport> = Object.freeze(
  {},
) as Record<number, Transport>;

const clientCache = new WeakMap<object, Map<number, PublicClient>>();

/** Create a PublicClient for the given chain ID, or return undefined.
 *  Instances are reused per `(transports, chainId)` where `transports`
 *  is keyed by object identity — the typical EVMcrispr `#transports`
 *  reference stays stable and benefits the cache across completions /
 *  walks / switches. Inline literal maps miss the cache (by design).
 */
export function clientForChain(
  chainId: number,
  transports?: Record<number, Transport>,
): PublicClient | undefined {
  const chain = Object.values(viemChains).find(
    (c) => (c as Chain).id === chainId,
  ) as Chain | undefined;
  if (!chain) return undefined;

  const transportsKey =
    transports === undefined ? NO_TRANSPORTS_SENTINEL : (transports as object);

  let byChainId = clientCache.get(transportsKey);
  if (!byChainId) {
    byChainId = new Map<number, PublicClient>();
    clientCache.set(transportsKey, byChainId);
  }

  const hit = byChainId.get(chainId);
  if (hit) return hit;

  const client = createPublicClient({
    chain,
    transport: transports?.[chainId] ?? http(),
  }) as PublicClient;
  byChainId.set(chainId, client);
  return client;
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

/** Mutable chain context threaded through the walk. `walkScript` advances
 *  `chainId` / `client` whenever it visits a `switch` command, so the
 *  resolver and helper-cache lookups always see the chain that was active
 *  at *that point* in the script — not the chain that wins after every
 *  switch in the file has been applied. */
export interface WalkChainState {
  chainId: number;
  client: PublicClient | undefined;
  /** Optional per-chain transports map. Used by `applySwitch` to mint a
   *  client for the chain a `switch` command targets. */
  transports?: Record<number, Transport>;
}

/** If `c` is a `switch <chain>` we can resolve, mutate `state` in place
 *  to point at the new chain. The `chainId` always advances (it comes
 *  from the parser and is what helpers like `@token(DAI)` key off of,
 *  even without RPC). The `client` only swaps when viem knows the
 *  chain — for unknown chains we keep the previous client so calls
 *  that *do* need RPC degrade gracefully instead of hard-failing. */
export function applySwitch(
  state: WalkChainState,
  c: CommandExpressionNode,
  bindings: BindingsManager,
): void {
  const switchedChainId = resolveSwitchChainId(c, bindings);
  if (switchedChainId == null) return;
  state.chainId = switchedChainId;
  const newClient = clientForChain(switchedChainId, state.transports);
  if (newClient) {
    state.client = newClient;
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
 *
 * `state` is read on every dispatch so that `switch` commands the
 * caller applies between resolver invocations are picked up immediately
 * — the helper cache key (`helper:<chainId>:...`) and the chain id
 * forwarded to `resolveHelper` always reflect the *current* chain.
 */
export function createNodeResolver(
  bindings: BindingsManager,
  cache: BindingsManager,
  state: WalkChainState,
  resolveHelper?: HelperResolver,
): (node: Node) => Promise<any> {
  const ctx: InterpretCtx = {
    bindings,
    get chainId() {
      return state.chainId;
    },
    get client() {
      return state.client;
    },
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
        state.chainId,
        state.client as PublicClient,
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

/** Seed every `EventCapture` / `ErrorCapture` slot on a command as a
 *  USER binding. The walker can't predict the runtime value (logs and
 *  reverts only exist at execution time), so the bindings hold a
 *  placeholder name that the hover renderer suppresses — what matters
 *  is that the variable *exists* in the prewarm snapshot, so hovering
 *  `$err` later renders `**Variable** $err` instead of "no info".
 *
 *  Note: capture slots are parsed WITHOUT the `$` prefix (the runtime
 *  prefixes them when calling `applyDestructure`). We mirror that here
 *  so the hover lookup `bindings.getBindingValue("$err", USER)` finds
 *  the placeholder. */
function seedCapturePlaceholders(
  slots: DestructureSlot[],
  bindings: BindingsManager,
): void {
  for (const s of slots) {
    if (typeof s === "string") {
      const key = `$${s}`;
      try {
        bindings.setBinding(key, key, USER);
      } catch {
        // binding already exists
      }
    } else if (Array.isArray(s)) {
      seedCapturePlaceholders(s, bindings);
    }
  }
}

function seedCaptureBindings(
  c: CommandExpressionNode,
  bindings: BindingsManager,
): void {
  const captures: Array<EventCaptureNode | ErrorCaptureNode> = [
    ...(c.eventCaptures ?? []),
    ...(c.errorCaptures ?? []),
  ];
  for (const cap of captures) {
    seedCapturePlaceholders(cap.captures, bindings);
    if ("boolVar" in cap && cap.boolVar) {
      try {
        bindings.setBinding(`$${cap.boolVar}`, `$${cap.boolVar}`, USER);
      } catch {
        // binding already exists
      }
    }
  }
}

/** Walk a list of fully-typed command nodes and resolve any bindings they
 *  produce (variable → USER, custom type with resolve → arbitrary bindings,
 *  event/error captures → USER placeholders).
 *
 *  Per-command behaviour is driven by the command's own argDefs (looking
 *  for `type: "variable"` or a custom type with a `resolve()` hook) and
 *  by any `eventCaptures` / `errorCaptures` attached to the node — never
 *  by command-name allowlists. New binding-producing commands therefore
 *  participate in prewarm automatically.
 *
 *  `state` is mutated in place when a `switch` command is encountered,
 *  so any helper resolution that runs *after* the switch (e.g. the rhs
 *  of `set $x @token(WETH)` later in the file) sees the new chain.
 *
 *  When `history` is provided, each `set`-style variable assignment is also
 *  appended to it as `{ line, value }`. Hover uses this to render the value
 *  of `$x` as it stood at a given line (the live `bindings` only carries
 *  the *latest* value because variables are overwritten in place). */
export async function walkCommandsForBindings(
  commandNodes: CommandExpressionNode[],
  bindings: BindingsManager,
  cache: BindingsManager,
  state: WalkChainState,
  resolveNode: (node: Node) => Promise<any>,
  history?: VariableHistory,
): Promise<void> {
  let parentModule = "std";

  for (const c of commandNodes) {
    if (hasCommandsBlock(c)) {
      parentModule = c.module ?? parentModule;
    }
    const commandModule = c.module ?? parentModule;

    // Even when the command isn't registered (e.g. an aragonos command
    // before `load aragonos` has run, or a typo) the user can still
    // attach event/error captures to it — seed those so hover finds
    // the symbols even when the command resolution fails.
    seedCaptureBindings(c, bindings);

    // Apply `switch` BEFORE resolving this command's args so the switch
    // itself never runs on the previous chain.
    applySwitch(state, c, bindings);

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
              client: state.client as PublicClient,
              chainId: state.chainId,
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
 * Parse `script` and walk every command up to (and including) `upToLine`,
 * producing the bindings + variable history hover needs to render rich
 * cards. Helper-function results are also written into `moduleCache`'s
 * CACHE space (using the same key shape as completions), which is what
 * makes hover's address card visible for `@ens(...)` etc.
 *
 * Per-command behaviour is purely argDef-driven (see
 * `walkCommandsForBindings`): commands with `type: "variable"` argDefs
 * seed USER bindings, custom-typed argDefs with a `resolve()` hook get
 * invoked, and any `eventCaptures` / `errorCaptures` on a node seed
 * placeholder bindings for the captured slots. This means new
 * binding-producing commands work automatically — no allowlist edits.
 *
 * `upToLine` is 1-indexed (matches `Position.line`). Pass `Infinity` to
 * walk the entire script.
 *
 * Returns the per-walk USER bindings and the effective chainId after any
 * `switch` commands. Failures during parsing or RPC lookup are swallowed —
 * the function always resolves so callers can use it as a best-effort
 * pre-warm step.
 */
export async function walkScript(
  script: string,
  upToLine: number,
  moduleCache: BindingsManager,
  resolveHelper: HelperResolver | undefined,
  transports: Record<number, Transport> | undefined,
  initialChainId: number = mainnet.id,
): Promise<WalkResult> {
  const bindings = new BindingsManager();
  seedBindings(bindings, moduleCache);

  const variableHistory: VariableHistory = new Map();

  // The walk starts on the caller-provided chain (defaults to mainnet)
  // and `applySwitch` advances `state` in place when it sees a `switch`
  // command. EVMcrispr passes its own `#chainId` so the walk runs on
  // the same chain the executor would use.
  const initialClient = clientForChain(initialChainId, transports);

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
      return {
        bindings,
        chainId: initialChainId,
        client: initialClient,
        variableHistory,
      };
    }
  }

  // Walk EVERY command up to `upToLine`, including those inside blocks
  // that don't enclose the cursor (e.g. a `connect myDao { ... }`
  // block whose body installs apps the rest of the script references).
  // The per-command logic in `walkCommandsForBindings` already decides
  // what to do based on each command's argDefs and capture nodes — no
  // command-name allowlist required.
  const commandNodes: CommandExpressionNode[] =
    ast?.getAllCommandsUntilLine(upToLine) ?? [];

  const state: WalkChainState = {
    chainId: initialChainId,
    client: initialClient,
    transports,
  };

  const resolveNode = createNodeResolver(
    bindings,
    moduleCache,
    state,
    resolveHelper,
  );

  await walkCommandsForBindings(
    commandNodes,
    bindings,
    moduleCache,
    state,
    resolveNode,
    variableHistory,
  );

  // Snapshot the end-of-walk chain so callers (EVMcrispr.prewarm) can
  // pair the right client with the chainId in hover requests.
  const finalChainId = state.chainId;
  const finalClient = state.client;

  // Second pass: populate the helper cache for *every* command the
  // user might hover over, including helpers inside non-binding
  // commands (`print @token(DAI)`) and helpers nested deep inside
  // `connect myDao { ... }` blocks. Helpers already evaluated during
  // `walkCommandsForBindings` are cache hits and re-add no network
  // cost.
  //
  // The helper cache is keyed by chain id, so we replay switches from
  // the initial chain and let `applySwitch` advance `state` again as
  // we revisit each command.
  state.chainId = initialChainId;
  state.client = initialClient;
  await prewarmHelperExpressions(commandNodes, resolveNode, state, bindings);

  return {
    bindings,
    chainId: finalChainId,
    client: finalClient,
    variableHistory,
  };
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
 *
 * `state` is mutated in place when a `switch` command is encountered,
 * so the cache key for `@token(DAI)` after `switch optimism` uses
 * chain 10 — distinct from the same call seen earlier on chain 1.
 */
async function prewarmHelperExpressions(
  commandNodes: CommandExpressionNode[],
  resolveNode: (node: Node) => Promise<any>,
  state: WalkChainState,
  bindings: BindingsManager,
): Promise<void> {
  for (const c of commandNodes) {
    applySwitch(state, c, bindings);
    for (const arg of c.args) {
      try {
        await resolveNode(arg);
      } catch {
        // resolveNode already swallows; this is belt-and-suspenders.
      }
    }
  }
}
