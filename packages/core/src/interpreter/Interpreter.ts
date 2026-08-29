import Std from "@evmcrispr/module-std";
import type {
  Action,
  Binding,
  Module,
  ModuleContext,
  NodeInterpreter,
  NodesInterpreter,
  OffchainOverlay,
  RelativeBinding,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  ControlFlowSignal,
  createOffchainOverlay,
  defaultTransport,
  ErrorException,
  ExitSignal,
  ExperimentalDisabledError,
  experimentalDisabledMessage,
  IPFSResolver,
  isExperimentalEnabled,
  resolveChain,
} from "@evmcrispr/sdk";
import type { Address, Chain, PublicClient, Transport } from "viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

import type { ModuleRegistry } from "../evml/registry";
import type { EvmlConfig } from "../evml/types";
import { parseScript } from "../parsers/script";
import {
  createInterpreter,
  type InterpretCtx,
  makeExecuteWithCaptures,
  makeExecutionResolveCallExpression,
  makeExecutionResolveCommand,
  makeExecutionResolveHelper,
  makeResolveBlockExpression,
} from "./index";

/**
 * The low-level EVML runtime: parses and interprets a script against a
 * module registry and environment config. Most consumers should use the
 * `evml` tagged-template API instead; `Interpreter` is the escape hatch
 * for tests and advanced embedding (direct access to `interpretNode`,
 * `bindingsManager`, `getModule`, ...).
 */
export class Interpreter {
  readonly bindingsManager: BindingsManager;
  readonly registry: ModuleRegistry;

  #std!: Std;
  #modules: Module[];
  #nonces: Record<string, number>;
  #offchain: OffchainOverlay;
  #account: Address | undefined;
  #source: string | undefined;
  #sender: Address | undefined;
  #chainId: number;
  #chain: Chain | undefined;

  #logListeners: ((message: string, prevMessages: string[]) => void)[];
  #lineListeners: ((line: number | null) => void)[];
  #actionObservers: ((action: Action) => void)[];
  #prevMessages: string[];
  #signal?: AbortSignal;

  #client: PublicClient | undefined;

  #ipfsResolver: IPFSResolver;
  #transports?: Record<number, Transport>;
  /** Captures wrapper bound to this instance — used by the execution-mode
   *  command resolver. Built lazily once `interpretNode` is available. */
  #executeWithCaptures!: ReturnType<typeof makeExecuteWithCaptures>;

  constructor(registry: ModuleRegistry, config: EvmlConfig = {}) {
    this.registry = registry;
    this.bindingsManager = new BindingsManager();
    this.#modules = [];
    this.#nonces = {};
    this.#offchain = createOffchainOverlay();
    this.#chainId = config.chainId ?? mainnet.id;
    // Before the first client: the host's transports decide where the
    // initial chain is read from (a test's anvil, a proxied RPC, ...).
    this.#transports = config.transports;
    const initialTransport = this.#transportFor(this.#chainId);
    this.#chain = resolveChain(this.#chainId, initialTransport);
    if (!this.#chain) {
      throw new ErrorException(`Unknown chain id ${this.#chainId}`);
    }
    this.#client = createPublicClient({
      chain: this.#chain,
      transport: initialTransport ?? http(),
    }) as PublicClient;
    this.#account = config.account;
    this.#sender = config.sender;
    this.#logListeners = config.onLog ? [config.onLog] : [];
    this.#lineListeners = config.onLine ? [config.onLine] : [];
    this.#actionObservers = [];
    this.#prevMessages = [];
    this.#ipfsResolver = new IPFSResolver();

    this.#initStd();

    // Wire the unified interpreter. The ctx closes over `this`, so live
    // state (modules, client, ...) is read at call time — no rebuild
    // needed when modules load or chains switch.
    const liveChainId = () => this.#chainId;
    const ctx: InterpretCtx = {
      bindings: this.bindingsManager,
      // resolveCallExpression/resolveHelper read live state via closures;
      // chainId is also live so config-var default templates substitute the
      // active chain.
      get chainId() {
        return liveChainId();
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
      // Line notification doubles as the per-node abort checkpoint.
      notifyLine: (line) => {
        if (this.#signal?.aborted) {
          throw new ErrorException("Execution cancelled");
        }
        this.#notifyLine(line);
      },
    };
    const interpreters = createInterpreter(ctx);
    this.interpretNode = interpreters.interpretNode;
    this.interpretNodes = interpreters.interpretNodes;

    this.#executeWithCaptures = makeExecuteWithCaptures({
      bindings: this.bindingsManager,
      getClient: () => this.#getClient(),
      interpretNode: this.interpretNode,
      onActionDispatch: (action) => {
        for (const observer of this.#actionObservers) observer(action);
      },
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
      value: this.#std.toModuleData(),
    };
  }

  #createModuleContext(): ModuleContext {
    const self = this;
    return {
      get signal() {
        return self.#signal;
      },
      bindingsManager: this.bindingsManager,
      nonces: this.#nonces,
      offchain: this.#offchain,
      ipfsResolver: this.#ipfsResolver,
      modules: this.#modules,
      getClient: () => this.getClient(),
      getChainId: () => this.getChainId(),
      getChain: () => this.getChain(),
      switchChainId: (chainId) => this.switchChainId(chainId),
      getConnectedAccount: (retreiveInjected) =>
        this.getConnectedAccount(retreiveInjected),
      getTransport: (chainId) => this.#transportFor(chainId) ?? http(),
      setClient: (client) => this.setClient(client),
      setConnectedAccount: (account) => this.setConnectedAccount(account),
      getSender: () => this.getSender(),
      setSender: (sender) => this.setSender(sender),
      log: (message) => this.log(message),
      getStd: () => this.#std,
      loadModule: async (name) => {
        if (this.registry.isExperimental(name) && !isExperimentalEnabled()) {
          throw new ExperimentalDisabledError(
            experimentalDisabledMessage("module", name),
          );
        }
        const loader = this.registry.get(name);
        if (!loader) throw new ErrorException(`Module ${name} not found`);
        return loader();
      },
      getAvailableModuleNames: () => this.registry.names(),
      parseEvml: (script) => parseScript(script),
      getSource: () => this.#source,
    };
  }

  #initStd(): void {
    this.#std = new Std(this.#createModuleContext());
  }

  // ---------------------------------------------------------------------------
  // Public API: interpret
  // ---------------------------------------------------------------------------

  async interpret(
    script: string,
    actionCallback?: (action: Action) => Promise<unknown>,
    options: { signal?: AbortSignal } = {},
  ): Promise<Action[]> {
    this.#signal = options.signal;
    this.#source = script;
    const { ast, errors } = parseScript(script);

    if (errors.length) {
      throw new ErrorException(`Parse errors:\n${errors.join("\n")}`);
    }

    // Reset per-execution state
    this.#modules = [];
    this.#nonces = {};
    this.#offchain = createOffchainOverlay();
    this.#prevMessages = [];
    this.#initStd();
    this.bindingsManager.setBindings(this.#buildStdBinding());

    try {
      const results = await this.interpretNodes(ast.body, true, {
        actionCallback,
      });
      return results.flat().filter((result) => typeof result !== "undefined");
    } catch (err) {
      // A `loop break` / `loop continue` / `def return` that reached the
      // top level was used outside its construct — surface it as a plain
      // error (its default message says where it belongs). `ExitSignal`
      // keeps propagating: it's the clean-stop mechanism callers handle.
      if (err instanceof ControlFlowSignal && !(err instanceof ExitSignal)) {
        throw new ErrorException(err.message);
      }
      throw err;
    } finally {
      this.#notifyLine(null);
    }
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
  }

  async getClient(): Promise<PublicClient> {
    return this.#getClient();
  }

  setConnectedAccount(account: Address | undefined) {
    this.#account = account;
  }

  setSender(sender: Address | undefined) {
    this.#sender = sender;
  }

  /** The account the current calls are sent from: the one a block command
   *  set, else the connected account. */
  async getSender(): Promise<Address> {
    return this.#sender ?? this.getConnectedAccount(true);
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

  /** Host-configured transport for a chain, else the transport a module
   *  declared for it (`ChainDef.rpcUrl`). Undefined for unknown chains. */
  #transportFor(chainId: number): Transport | undefined {
    return this.#transports?.[chainId] ?? defaultTransport(chainId);
  }

  switchChainId(chainId: number): PublicClient {
    this.#chainId = chainId;

    const transport = this.#transportFor(chainId);
    const chain = resolveChain(chainId, transport);
    this.#chain = chain;
    const client = chain
      ? (createPublicClient({
          chain,
          transport: transport ?? http(),
        }) as PublicClient)
      : undefined;
    this.#client = client;

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

  getModule(name: string): Module | undefined {
    if (name === this.#std.name) {
      return this.#std;
    }

    return this.#modules.find((m) => m.name === name);
  }

  getAllModules(): Module[] {
    return [this.#std, ...this.#modules];
  }

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  registerLogListener(
    listener: (message: string, prevMessages: string[]) => void,
  ): Interpreter {
    this.#logListeners.push(listener);
    return this;
  }

  registerLineListener(listener: (line: number | null) => void): Interpreter {
    this.#lineListeners.push(listener);
    return this;
  }

  /** Observes every action the first time it is dispatched for execution,
   *  including actions consumed inside `sim:fork` blocks (which never
   *  surface in `interpret()`'s return value). */
  registerActionObserver(observer: (action: Action) => void): Interpreter {
    this.#actionObservers.push(observer);
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
  // All node-level interpretation lives in `./index`. Both fields are
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
