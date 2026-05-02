import Std from "@evmcrispr/module-std";
import type {
  Action,
  Binding,
  CommandExpressionNode,
  CompletionItem,
  HelperFunctionNode,
  HelperResolver,
  IModuleConstructor,
  Module,
  ModuleContext,
  ModuleData,
  Node,
  NodeInterpreter,
  NodesInterpreter,
  Param,
  Position,
  RelativeBinding,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  ErrorException,
  IPFSResolver,
  NodeType,
  resolveHelper as resolveHelperFn,
} from "@evmcrispr/sdk";
import type { Address, Chain, PublicClient, Transport } from "viem";
import { createPublicClient, http } from "viem";
import * as viemChains from "viem/chains";
import { mainnet } from "viem/chains";

import {
  getCompletions as getCompletionsImpl,
  getKeywords as getKeywordsImpl,
} from "./completions";
import {
  type DocumentSymbol,
  getDocumentSymbols as getDocumentSymbolsImpl,
} from "./documentSymbols";
import { getHoverInfo as getHoverInfoImpl, type HoverInfo } from "./hover";
import {
  createInterpreter,
  type InterpretCtx,
  makeExecuteWithCaptures,
  makeExecutionResolveCallExpression,
  makeExecutionResolveCommand,
  makeExecutionResolveHelper,
  makeResolveBlockExpression,
} from "./interpreter";
import { parseScript } from "./parsers/script";
import { type VariableHistory, walkScript } from "./scriptWalk";
import {
  getSignatureHelp as getSignatureHelpImpl,
  type SignatureHelp,
} from "./signature";

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type ParseDiagnostic = {
  /** 1-indexed line number. */
  line: number;
  /** 0-indexed column offset. */
  col: number;
  message: string;
  severity: "error" | "warning";
};

/** Extract structured data from a parser error string.
 *  Format produced by `buildParserError`: `Type(line:col): message` */
function parseDiagnosticString(error: string): ParseDiagnostic | null {
  const match = error.match(/^\w+\((\d+):(\d+)\):\s*(.+)$/);
  if (!match) return null;
  return {
    line: Number(match[1]),
    col: Number(match[2]),
    message: match[3],
    severity: "error",
  };
}

export class EVMcrispr {
  readonly bindingsManager: BindingsManager;

  static #registry = new Map<
    string,
    () => Promise<{ default: IModuleConstructor }>
  >();

  static #descriptions = new Map<string, string>();

  static registerModule(
    name: string,
    loader: () => Promise<{ default: IModuleConstructor }>,
    description?: string,
  ): void {
    EVMcrispr.#registry.set(name, loader);
    if (description) EVMcrispr.#descriptions.set(name, description);
  }

  #std!: Std;
  #modules: Module[];
  #nonces: Record<string, number>;
  #account: Address | undefined;
  #chainId: number;
  #chain: Chain | undefined;

  #logListeners: ((message: string, prevMessages: string[]) => void)[];
  #lineListeners: ((line: number | null) => void)[];
  #prevMessages: string[];

  #client: PublicClient | undefined;

  /** Internal module cache for completions / keywords. */
  #moduleCache: BindingsManager;
  /** USER bindings produced by the most recent `prewarm(script)` call. */
  #scriptBindings?: BindingsManager;
  /** Per-variable `(line, value)` history from the most recent
   *  `prewarm(script)` call. Used by hover to render a variable's value
   *  as it stood at a specific line. */
  #variableHistory?: VariableHistory;
  /** Effective chain id observed during the most recent `prewarm(script)`. */
  #scriptChainId?: number;
  /** Effective PublicClient for the chain reached at the end of the most
   *  recent `prewarm(script)` call. May differ from `#client` when the
   *  script `switch`ed chains. Always paired with `#scriptChainId`. */
  #scriptClient?: PublicClient;
  /** Monotonic guard so slower prewarm calls cannot publish stale state. */
  #prewarmSequence = 0;
  #ipfsResolver: IPFSResolver;
  #transports?: Record<number, Transport>;
  /** Captures wrapper bound to this instance — used by the execution-mode
   *  command resolver. Built lazily once `interpretNode` is available. */
  #executeWithCaptures!: ReturnType<typeof makeExecuteWithCaptures>;

  constructor(account?: Address, transports?: Record<number, Transport>) {
    this.bindingsManager = new BindingsManager();
    this.#modules = [];
    this.#nonces = {};
    this.#chainId = mainnet.id;
    this.#chain = mainnet;
    this.#client = createPublicClient({
      chain: mainnet,
      transport: transports?.[mainnet.id] ?? http(),
    }) as PublicClient;
    this.#account = account;
    this.#logListeners = [];
    this.#lineListeners = [];
    this.#prevMessages = [];
    this.#ipfsResolver = new IPFSResolver();
    this.#transports = transports;

    this.#initStd();
    this.#moduleCache = new BindingsManager([this.#buildStdBinding()]);

    // Wire the unified interpreter. The ctx closes over `this`, so live
    // state (modules, client, ...) is read at call time — no rebuild
    // needed when modules load or chains switch.
    const ctx: InterpretCtx = {
      bindings: this.bindingsManager,
      // Execution mode never reads chainId/client from ctx (no helperCache);
      // resolveCallExpression/resolveHelper read live state via closures.
      get chainId() {
        return 0;
      },
      get client() {
        return undefined;
      },
      onError: "throw",
      resolveHelper: makeExecutionResolveHelper({
        bindings: this.bindingsManager,
        std: () => this.#std,
        modules: () => this.#modules,
      }),
      resolveBlockExpression: makeResolveBlockExpression(this.bindingsManager),
      resolveCallExpression: makeExecutionResolveCallExpression({
        bindings: this.bindingsManager,
        getClient: () => this.#getClient(),
      }),
      // resolveCommand depends on executeWithCaptures, which depends on
      // interpretNode. Wire it up after we've built the interpreters.
      notifyLine: (line) => this.#notifyLine(line),
    };
    const interpreters = createInterpreter(ctx);
    this.interpretNode = interpreters.interpretNode;
    this.interpretNodes = interpreters.interpretNodes;

    this.#executeWithCaptures = makeExecuteWithCaptures({
      bindings: this.bindingsManager,
      getClient: () => this.#getClient(),
      interpretNode: this.interpretNode,
    });

    ctx.resolveCommand = makeExecutionResolveCommand({
      bindings: this.bindingsManager,
      std: () => this.#std,
      modules: () => this.#modules,
      getClient: () => this.#getClient(),
      executeWithCaptures: this.#executeWithCaptures,
    });
  }

  #buildStdBinding(): Binding {
    return {
      type: BindingsSpace.MODULE,
      identifier: "std",
      value: {
        commands: this.#std.commands,
        helpers: this.#std.helpers,
        helperReturnTypes: this.#std.helperReturnTypes,
        helperHasArgs: this.#std.helperHasArgs,
        helperArgDefs: this.#std.helperArgDefs,
        helperDescriptions: this.#std.helperDescriptions,
        commandDescriptions: this.#std.commandDescriptions,
        types: this.#std.types,
      },
    };
  }

  #createModuleContext(): ModuleContext {
    return {
      bindingsManager: this.bindingsManager,
      nonces: this.#nonces,
      ipfsResolver: this.#ipfsResolver,
      modules: this.#modules,
      getClient: () => this.getClient(),
      getChainId: () => this.getChainId(),
      getChain: () => this.getChain(),
      switchChainId: (chainId) => this.switchChainId(chainId),
      getConnectedAccount: (retreiveInjected) =>
        this.getConnectedAccount(retreiveInjected),
      getTransport: (chainId) => this.#transports?.[chainId] ?? http(),
      setClient: (client) => this.setClient(client),
      setConnectedAccount: (account) => this.setConnectedAccount(account),
      log: (message) => this.log(message),
      loadModule: async (name) => {
        const loader = EVMcrispr.#registry.get(name);
        if (!loader) throw new ErrorException(`Module ${name} not found`);
        return loader();
      },
      getAvailableModuleNames: () => [...EVMcrispr.#registry.keys()],
    };
  }

  #initStd(): void {
    this.#std = new Std(this.#createModuleContext());
  }

  /**
   * Extract module names referenced by `load` commands in the given script.
   */
  #extractLoadModuleNames(script: string): string[] {
    try {
      const { ast } = parseScript(script);
      const lines = script.split("\n");
      const loadCommands = ast.getCommandsUntilLine(lines.length, ["load"]);
      return loadCommands
        .filter(
          (c: CommandExpressionNode) => c.name === "load" && c.args[0]?.value,
        )
        .map((c: CommandExpressionNode) => c.args[0].value as string);
    } catch {
      return [];
    }
  }

  /**
   * Populate the module cache with data for the given module names only.
   * Modules already in the cache are skipped.
   */
  async #ensureModulesInCache(names: string[]): Promise<void> {
    const ctx = this.#createModuleContext();
    for (const name of names) {
      if (this.#moduleCache.hasBinding(name, BindingsSpace.MODULE)) continue;
      const loader = EVMcrispr.#registry.get(name);
      if (!loader) continue;
      try {
        const { default: Ctor } = await loader();
        const instance = new Ctor(ctx);
        this.#moduleCache.setBinding(
          name,
          {
            commands: instance.commands,
            helpers: instance.helpers,
            helperReturnTypes: instance.helperReturnTypes,
            helperHasArgs: instance.helperHasArgs,
            helperArgDefs: instance.helperArgDefs,
            helperDescriptions: instance.helperDescriptions,
            commandDescriptions: instance.commandDescriptions,
            types: instance.types,
          },
          BindingsSpace.MODULE,
        );
      } catch {
        // Module failed to load — skip it
      }
    }
  }

  /**
   * Create a HelperResolver callback that can execute helpers with
   * pre-resolved arguments.  Used by the completions engine to evaluate
   * expressions like `@token(USDC)` during the walk phase.
   */
  #createHelperResolver(): HelperResolver {
    return async (
      helperName: string,
      resolvedArgs: string[],
      chainId: number,
      client: PublicClient,
      bindings: BindingsManager,
    ): Promise<Param> => {
      // Find which module owns this helper
      const moduleBindings = this.#moduleCache.getAllBindings({
        spaceFilters: [BindingsSpace.MODULE],
        ignoreNullValues: true,
      });

      let ownerModuleName: string | undefined;
      for (const b of moduleBindings) {
        const data = b.value as ModuleData;
        if (data.helpers[helperName]) {
          ownerModuleName = b.identifier;
          break;
        }
      }

      if (!ownerModuleName) {
        throw new ErrorException(
          `helper @${helperName} not found on any module`,
        );
      }

      // Load the module constructor and create a lightweight instance
      const loader = EVMcrispr.#registry.get(ownerModuleName);
      let Ctor: IModuleConstructor;

      if (ownerModuleName === "std") {
        Ctor = Std as unknown as IModuleConstructor;
      } else if (loader) {
        const mod = await loader();
        Ctor = mod.default;
      } else {
        throw new ErrorException(
          `module ${ownerModuleName} not found in registry`,
        );
      }

      const ctx: ModuleContext = {
        bindingsManager: bindings,
        nonces: {},
        ipfsResolver: this.#ipfsResolver,
        modules: [],
        getClient: () => Promise.resolve(client),
        getChainId: () => Promise.resolve(chainId),
        getChain: () => Promise.resolve(this.#chain),
        switchChainId: () => {
          throw new ErrorException(
            "switchChainId not available during completions",
          );
        },
        getConnectedAccount: () => {
          throw new ErrorException(
            "getConnectedAccount not available during completions",
          );
        },
        getTransport: (cId) => this.#transports?.[cId] ?? http(),
        setClient: () => {},
        setConnectedAccount: () => {},
        log: () => {},
        loadModule: async (name) => {
          const l = EVMcrispr.#registry.get(name);
          if (!l) throw new ErrorException(`Module ${name} not found`);
          return l();
        },
        getAvailableModuleNames: () => [...EVMcrispr.#registry.keys()],
      };

      const instance = new Ctor(ctx);

      // Build a synthetic HelperFunctionNode with StringLiteral args
      const syntheticNode: HelperFunctionNode = {
        type: NodeType.HelperFunctionExpression,
        name: helperName,
        args: resolvedArgs.map((value) => ({
          type: NodeType.StringLiteral as any,
          value,
        })),
      };

      // Passthrough interpreters — args are already resolved
      const interpreters = {
        interpretNode: async (n: Node) => (n as any).value,
        interpretNodes: async (nodes: Node[]) =>
          nodes.map((n) => (n as any).value),
      };

      const helper = await resolveHelperFn(instance.helpers[helperName]);
      return helper(instance, syntheticNode, interpreters);
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: interpret, getCompletions, getKeywords, getDiagnostics
  // ---------------------------------------------------------------------------

  async interpret(
    script: string,
    actionCallback?: (action: Action) => Promise<unknown>,
  ): Promise<Action[]> {
    const { ast, errors } = parseScript(script);

    if (errors.length) {
      throw new ErrorException(`Parse errors:\n${errors.join("\n")}`);
    }

    // Reset per-execution state
    this.#modules = [];
    this.#nonces = {};
    this.#logListeners = this.#logListeners; // keep listeners
    this.#prevMessages = [];
    this.#initStd();
    this.bindingsManager.setBindings(this.#buildStdBinding());

    const results = await this.interpretNodes(ast.body, true, {
      actionCallback,
    });

    this.#notifyLine(null);

    return results.flat().filter((result) => typeof result !== "undefined");
  }

  async getCompletions(
    script: string,
    position: Position,
  ): Promise<CompletionItem[]> {
    await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));

    // Store the current list of available module names in the cache so
    // the `load` command can suggest them during autocompletion.
    this.#moduleCache.setMetadata(
      "__available_modules__",
      JSON.stringify(
        [...EVMcrispr.#registry.keys()].map((name) => ({
          name,
          description: EVMcrispr.#descriptions.get(name),
        })),
      ),
    );

    return getCompletionsImpl(
      script,
      position,
      this.#moduleCache,
      this.#createHelperResolver(),
      this.#transports,
      this.#chainId,
    );
  }

  async getKeywords(
    script: string,
  ): Promise<{ commands: string[]; helpers: string[] }> {
    await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));
    return getKeywordsImpl(script, this.#moduleCache);
  }

  async getHoverInfo(
    script: string,
    position: Position,
  ): Promise<HoverInfo | null> {
    await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));
    // Pair the chainId with the matching client so on-chain hover calls
    // (eth_getCode etc.) hit the same chain we report in the card. After a
    // `switch` in the script, `#scriptClient` points at the switched-to
    // chain even though `#client` still points at the constructor chain.
    const chainId = this.#scriptChainId ?? this.#chainId;
    const client =
      this.#scriptChainId != null && this.#scriptClient
        ? this.#scriptClient
        : this.#client;
    return getHoverInfoImpl(script, position, {
      moduleCache: this.#moduleCache,
      scriptBindings: this.#scriptBindings,
      variableHistory: this.#variableHistory,
      client,
      chainId,
    });
  }

  /**
   * Pre-resolve every helper call and `set` in `script`, populating the
   * module cache (helper CACHE entries) and `#scriptBindings` (USER values).
   *
   * Call this on every debounced script change so subsequent hover requests
   * can render rich values (e.g. the address card under `@ens(vitalik.eth)`
   * or under a `$dao` variable) without making any new RPC calls.
   *
   * Always resolves; failures during parsing or lookup are swallowed.
   */
  async prewarm(script: string): Promise<void> {
    const sequence = ++this.#prewarmSequence;
    try {
      await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));
      if (sequence !== this.#prewarmSequence) return;

      const {
        bindings,
        chainId,
        client: effectiveClient,
        variableHistory,
      } = await walkScript(
        script,
        Number.POSITIVE_INFINITY,
        this.#moduleCache,
        this.#createHelperResolver(),
        this.#transports,
        this.#chainId,
      );

      if (sequence !== this.#prewarmSequence) return;

      this.#scriptBindings = bindings;
      this.#variableHistory = variableHistory;
      this.#scriptChainId = chainId || undefined;
      // Only retain the prewarmed client when the script switched to a
      // different chain than the constructor client; otherwise we'd shadow
      // any future `setClient(...)` call with a stale instance.
      this.#scriptClient =
        effectiveClient && effectiveClient !== this.#client
          ? effectiveClient
          : undefined;
    } catch {
      // best-effort — never throw from prewarm
    }
  }

  async getSignatureHelp(
    script: string,
    position: Position,
  ): Promise<SignatureHelp | null> {
    await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));
    return getSignatureHelpImpl(script, position, this.#moduleCache);
  }

  /** Return document symbols for the outline view.
   *  This is synchronous and does not require module data. */
  getDocumentSymbols(script: string): DocumentSymbol[] {
    return getDocumentSymbolsImpl(script);
  }

  /** Return parse diagnostics (errors) for the given script.
   *  This is synchronous and does not require module data. */
  getDiagnostics(script: string): ParseDiagnostic[] {
    try {
      const { errors } = parseScript(script);
      return errors
        .map(parseDiagnosticString)
        .filter((d): d is ParseDiagnostic => d !== null);
    } catch {
      return [];
    }
  }

  /** Flush the helper result cache.  Call after a transaction is executed. */
  flushCache(): void {
    this.#moduleCache.clearSpace(BindingsSpace.CACHE);
  }

  // ---------------------------------------------------------------------------
  // Client / account management
  // ---------------------------------------------------------------------------

  async getChainId(): Promise<number> {
    return this.#chainId;
  }

  setClient(client: PublicClient): void {
    this.#client = client;
    // Track the client's chain so subsequent helpers / commands see the
    // right chain id. Used by `sim:fork` to swap the active client to a
    // forked chain mid-execution.
    const chain = (client as any)?.chain as Chain | undefined;
    if (chain) {
      this.#chain = chain;
      this.#chainId = chain.id;
    }
    // Invalidate any prewarmed switched-to client, since the user is
    // explicitly choosing a new base client.
    this.#scriptClient = undefined;
  }

  async getClient(): Promise<PublicClient> {
    return this.#getClient();
  }

  setConnectedAccount(account: Address | undefined) {
    this.#account = account;
  }

  async getConnectedAccount(_retreiveInjected = false): Promise<Address> {
    if (!this.#account) {
      throw Error(
        "No connected account found. Connect a wallet or use --from to specify a sender address.",
      );
    }
    return this.#account;
  }

  async getChain(): Promise<Chain | undefined> {
    return this.#chain;
  }

  switchChainId(chainId: number): PublicClient {
    this.#chainId = chainId;

    const chain = Object.values(viemChains).find(
      (c) => (c as Chain).id === chainId,
    ) as Chain | undefined;
    this.#chain = chain;
    const client = chain
      ? (createPublicClient({
          chain,
          transport: this.#transports?.[chainId] ?? http(),
        }) as PublicClient)
      : undefined;
    this.#client = client;
    // Drop any prewarmed switched-to client; the next prewarm will
    // recompute from the new base client.
    this.#scriptClient = undefined;

    if (!client) throw Error("No client available");
    return client;
  }

  // ---------------------------------------------------------------------------
  // Bindings / modules
  // ---------------------------------------------------------------------------

  getBinding<BSpace extends BindingsSpace>(
    name: string,
    memSpace: BSpace,
  ): RelativeBinding<BSpace>["value"] | undefined {
    return this.bindingsManager.getBindingValue(name, memSpace);
  }

  getModule(aliasOrName: string): Module | undefined {
    if (aliasOrName === this.#std.name || aliasOrName === this.#std.alias) {
      return this.#std;
    }

    return this.#modules.find(
      (m) => m.name === aliasOrName || m.alias === aliasOrName,
    );
  }

  getAllModules(): Module[] {
    return [this.#std, ...this.#modules];
  }

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  registerLogListener(
    listener: (message: string, prevMessages: string[]) => void,
  ): EVMcrispr {
    this.#logListeners.push(listener);
    return this;
  }

  registerLineListener(listener: (line: number | null) => void): EVMcrispr {
    this.#lineListeners.push(listener);
    return this;
  }

  #notifyLine(line: number | null): void {
    this.#lineListeners.forEach((l) => l(line));
  }

  log(message: string): void {
    this.#logListeners.forEach((listener) =>
      listener(message, this.#prevMessages),
    );
    this.#prevMessages.push(message);
  }

  // ---------------------------------------------------------------------------
  // Interpreters
  // ---------------------------------------------------------------------------
  //
  // All node-level interpretation lives in `./interpreter`. Both fields are
  // assigned in the constructor — declare them here so the rest of the
  // class can reference them.

  interpretNode!: NodeInterpreter;
  interpretNodes!: NodesInterpreter;

  #getClient = async (): Promise<PublicClient> => {
    if (this.#client) {
      return this.#client;
    }
    throw Error("No client available");
  };
}
