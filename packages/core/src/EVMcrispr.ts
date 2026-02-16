import Std from "@evmcrispr/module-std";
import type {
  Action,
  ArrayExpressionNode,
  BarewordNode,
  BinaryExpressionNode,
  Binding,
  BlockExpressionNode,
  CallExpressionNode,
  CommandExpressionNode,
  CompletionItem,
  HelperFunctionNode,
  HelperResolver,
  IModuleConstructor,
  LiteralExpressionNode,
  Module,
  ModuleContext,
  ModuleData,
  Node,
  NodeInterpreter,
  NodesInterpreter,
  Position,
  RelativeBinding,
  VariableIdentifierNode,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  CommandError,
  ErrorException,
  ExpressionError,
  HaltExecution,
  HelperFunctionError,
  IPFSResolver,
  NodeError,
  NodeType,
  resolveHelper as resolveHelperFn,
  timeUnits,
  toDecimals,
} from "@evmcrispr/sdk";
import type { Abi, Address, Chain, PublicClient, Transport } from "viem";
import { createPublicClient, http, isAddress } from "viem";
import * as viemChains from "viem/chains";

import {
  getCompletions as getCompletionsImpl,
  getKeywords as getKeywordsImpl,
} from "./completions";
import { parseScript } from "./parsers/script";

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

const {
  AddressLiteral,
  BoolLiteral,
  BytesLiteral,
  NumberLiteral,
  StringLiteral,

  ArrayExpression,

  BinaryExpression,

  BlockExpression,
  CommandExpression,
  CallExpression,
  HelperFunctionExpression,

  Bareword,
  VariableIdentifier,
} = NodeType;

const { ABI, USER } = BindingsSpace;

export class EVMcrispr {
  readonly bindingsManager: BindingsManager;

  static #registry = new Map<
    string,
    () => Promise<{ default: IModuleConstructor }>
  >();

  static registerModule(
    name: string,
    loader: () => Promise<{ default: IModuleConstructor }>,
  ): void {
    EVMcrispr.#registry.set(name, loader);
  }

  #std!: Std;
  #modules: Module[];
  #nonces: Record<string, number>;
  #account: Address | undefined;
  #chainId: number | undefined;

  #logListeners: ((message: string, prevMessages: string[]) => void)[];
  #prevMessages: string[];

  #client: PublicClient | undefined;

  /** Internal module cache for completions / keywords. */
  #moduleCache: BindingsManager;
  #ipfsResolver: IPFSResolver;
  #transports?: Record<number, Transport>;

  constructor(
    client?: PublicClient,
    account?: Address,
    transports?: Record<number, Transport>,
  ) {
    this.bindingsManager = new BindingsManager();
    this.#modules = [];
    this.#nonces = {};
    this.#setDefaultBindings();
    this.#client = client;
    this.#account = account;
    this.#logListeners = [];
    this.#prevMessages = [];
    this.#ipfsResolver = new IPFSResolver();
    this.#transports = transports;

    this.#initStd();
    this.#moduleCache = new BindingsManager([this.#buildStdBinding()]);
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
   * Lazily populate the module cache with data from all registered modules.
   * This allows the eager-execution pipeline (used by completions and keywords)
   * to resolve any module referenced by a `load` command in the script.
   */
  async #ensureModuleCachePopulated(): Promise<void> {
    const ctx = this.#createModuleContext();
    for (const [name, loader] of EVMcrispr.#registry) {
      if (this.#moduleCache.hasBinding(name, BindingsSpace.MODULE)) continue;
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
    ): Promise<string> => {
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

    return results.flat().filter((result) => typeof result !== "undefined");
  }

  async getCompletions(
    script: string,
    position: Position,
  ): Promise<CompletionItem[]> {
    await this.#ensureModuleCachePopulated();

    // Store the current list of available module names in the cache so
    // the `load` command can suggest them during autocompletion.
    this.#moduleCache.setMetadata(
      "__available_modules__",
      JSON.stringify([...EVMcrispr.#registry.keys()]),
    );

    return getCompletionsImpl(
      script,
      position,
      this.#moduleCache,
      this.#client,
      this.#createHelperResolver(),
      this.#transports,
    );
  }

  async getKeywords(
    script: string,
  ): Promise<{ commands: string[]; helpers: string[] }> {
    await this.#ensureModuleCachePopulated();
    return getKeywordsImpl(script, this.#moduleCache);
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
    const chainId =
      this.#chainId ?? (await this.#getClient().then((c) => c.getChainId()));
    if (!chainId) {
      throw Error("No chain id found");
    }
    return chainId;
  }

  setClient(client: PublicClient | undefined): void {
    this.#client = client;
  }

  async getClient(): Promise<PublicClient> {
    return this.#getClient();
  }

  setConnectedAccount(account: Address | undefined) {
    this.#account = account;
  }

  async getConnectedAccount(_retreiveInjected = false): Promise<Address> {
    if (!this.#account) {
      throw Error("No connected account found");
    }
    return this.#account;
  }

  async switchChainId(chainId: number): Promise<PublicClient> {
    this.#chainId = chainId;

    const chain = Object.values(viemChains).find(
      (c) => (c as Chain).id === chainId,
    ) as Chain | undefined;
    if (chain) {
      this.#client = createPublicClient({
        chain,
        transport: this.#transports?.[chainId] ?? http(),
      }) as PublicClient;
    } else {
      this.#client = undefined;
    }

    return this.getClient();
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

  log(message: string): void {
    this.#logListeners.forEach((listener) =>
      listener(message, this.#prevMessages),
    );
    this.#prevMessages.push(message);
  }

  // ---------------------------------------------------------------------------
  // Interpreters (internal)
  // ---------------------------------------------------------------------------

  interpretNode: NodeInterpreter = (n, options) => {
    switch (n.type) {
      case AddressLiteral:
      case BoolLiteral:
      case BytesLiteral:
      case StringLiteral:
      case NumberLiteral:
        return this.#interpretLiteral(n as LiteralExpressionNode, options);
      case ArrayExpression:
        return this.#interpretArrayExpression(
          n as ArrayExpressionNode,
          options,
        );
      case BinaryExpression:
        return this.#interpretBinaryExpression(
          n as BinaryExpressionNode,
          options,
        );
      case BlockExpression:
        return this.#interpretBlockExpression(
          n as BlockExpressionNode,
          options,
        );
      case CallExpression:
        return this.#interpretCallFunction(n as CallExpressionNode, options);
      case CommandExpression:
        return this.#interpretCommand(n as CommandExpressionNode, options);
      case HelperFunctionExpression:
        return this.#interpretHelperFunction(n as HelperFunctionNode, options);
      case Bareword:
        return this.#interpretBareword(n as BarewordNode);
      case VariableIdentifier:
        return this.#interpretVariableIdentifier(
          n as VariableIdentifierNode,
          options,
        );

      default:
        EVMcrispr.panic(n, `unknown ${n.type} node found`);
    }
  };

  interpretNodes: NodesInterpreter = async (
    nodes: Node[],
    sequentally = false,
    options,
  ): Promise<any[]> => {
    if (sequentally) {
      const results: any = [];

      for (const node of nodes) {
        const result = await this.interpretNode(node, options);
        if (Array.isArray(result)) {
          results.push(...result);
        } else {
          results.push(result);
        }
      }

      return results;
    }

    return await Promise.all(
      nodes.map((node) => this.interpretNode(node, options)),
    );
  };

  // ---------------------------------------------------------------------------
  // Private interpreters
  // ---------------------------------------------------------------------------

  #getClient = async (): Promise<PublicClient> => {
    if (this.#client) {
      return this.#client;
    }
    throw Error("No client available");
  };

  #interpretArrayExpression: NodeInterpreter<ArrayExpressionNode> = (n) => {
    return this.interpretNodes(n.elements);
  };

  #interpretBinaryExpression: NodeInterpreter<BinaryExpressionNode> = async (
    n,
  ) => {
    const [leftOperand_, rightOperand_] = await this.interpretNodes([
      n.left,
      n.right,
    ]);

    let leftOperand: bigint, rightOperand: bigint;

    try {
      leftOperand = BigInt(leftOperand_);
    } catch (_err) {
      EVMcrispr.panic(
        n,
        `invalid left operand. Expected a number but got "${leftOperand_}"`,
      );
    }

    try {
      rightOperand = BigInt(rightOperand_);
    } catch (_err) {
      EVMcrispr.panic(
        n,
        `invalid right operand. Expected a number but got "${rightOperand_}"`,
      );
    }

    switch (n.operator) {
      case "+":
        return leftOperand + rightOperand;
      case "-":
        return leftOperand - rightOperand;
      case "*":
        return leftOperand * rightOperand;
      case "/": {
        if (rightOperand === 0n) {
          EVMcrispr.panic(n, `invalid operation. Can't divide by zero`);
        }
        return leftOperand / rightOperand;
      }
      case "^": {
        return leftOperand ** rightOperand;
      }
    }
  };

  #interpretBlockExpression: NodeInterpreter<BlockExpressionNode> = async (
    n,
    opts = {},
  ) => {
    this.bindingsManager.enterScope(opts.blockModule);

    if (opts.blockInitializer) {
      await opts.blockInitializer();
    }

    const results = await this.interpretNodes(n.body, true, opts);

    this.bindingsManager.exitScope();

    return results.filter((r) => !!r);
  };

  #interpretCallFunction: NodeInterpreter<CallExpressionNode> = async (n) => {
    const [targetAddress, ...args] = await this.interpretNodes([
      n.target,
      ...n.args,
    ]);

    if (!isAddress(targetAddress)) {
      EVMcrispr.panic(
        n,
        `invalid target. Expected an address, but got ${targetAddress}`,
      );
    }

    const targetAbi = this.bindingsManager.getBindingValue(
      targetAddress,
      ABI,
    ) as Abi | undefined;
    if (!targetAbi) {
      EVMcrispr.panic(n, `no ABI found for ${targetAddress}`);
    }

    try {
      const client = await this.#getClient();
      const res = await client.readContract({
        abi: targetAbi,
        functionName: n.method,
        args: args,
        address: targetAddress,
      });
      return res;
    } catch (err) {
      const err_ = err as Error;
      EVMcrispr.panic(
        n,
        `error occured whe calling ${n.target.value ?? targetAddress}: ${
          err_.message
        }`,
      );
    }
  };

  #interpretCommand: NodeInterpreter<CommandExpressionNode> = async (
    c,
    { actionCallback } = {},
  ) => {
    let module: Module | undefined = this.#std;
    const moduleName = c.module ?? this.bindingsManager.getScopeModule();

    if (moduleName && moduleName !== "std") {
      module = this.#modules.find((m) => m.contextualName === moduleName);

      if (!module) {
        EVMcrispr.panic(c, `module ${moduleName} not found`);
      }

      // Fallback to Std module
      if (!module.commands[c.name] && this.#std.commands[c.name]) {
        module = this.#std;
      }
    }

    let res: Awaited<ReturnType<typeof module.interpretCommand>>;

    try {
      res = await module.interpretCommand(c, {
        interpretNode: this.interpretNode,
        interpretNodes: this.interpretNodes,
        actionCallback,
      });

      if (res && actionCallback) {
        for (const action of res) {
          await actionCallback(action);
        }
      }
    } catch (err) {
      // Avoid wrapping a node error insde another node error
      if (err instanceof NodeError || err instanceof HaltExecution) {
        throw err;
      }

      const err_ = err as Error;

      EVMcrispr.panic(c, err_.message);
    }

    return res;
  };

  #interpretHelperFunction: NodeInterpreter<HelperFunctionNode> = async (h) => {
    const helperName = h.name;

    // Module constants: @NAME with no args
    if (h.args.length === 0) {
      const constantModules = [...this.#modules, this.#std].filter(
        (m) => m.constants[helperName] !== undefined,
      );
      if (constantModules.length === 1) {
        return constantModules[0].constants[helperName];
      }
      if (constantModules.length > 1) {
        EVMcrispr.panic(
          h,
          `constant name collision on modules ${constantModules.map((m) => m.contextualName).join(", ")}`,
        );
      }
      // Not a constant — fall through to helper resolution
    }

    const filteredModules = [...this.#modules, this.#std].filter(
      (m) => !!m.helpers[helperName],
    );

    if (!filteredModules.length) {
      EVMcrispr.panic(h, "helper not found on any module");
    }

    // TODO: Prefix helpers with module name/alias to avoid collisions
    else if (filteredModules.length > 1) {
      EVMcrispr.panic(
        h,
        `name collisions found on modules ${filteredModules.join(", ")}`,
      );
    }

    const m = filteredModules[0];

    let res: Awaited<ReturnType<typeof m.interpretHelper>>;

    try {
      res = await m.interpretHelper(h, {
        interpretNode: this.interpretNode,
        interpretNodes: this.interpretNodes,
      });
    } catch (err) {
      // Avoid wrapping a node error insde another node error
      if (err instanceof NodeError) {
        throw err;
      }

      const err_ = err as Error;

      EVMcrispr.panic(h, err_.message);
    }

    return res;
  };

  #interpretLiteral: NodeInterpreter<LiteralExpressionNode> = async (n) => {
    switch (n.type) {
      case NodeType.AddressLiteral:
      case NodeType.BoolLiteral:
      case NodeType.BytesLiteral:
      case NodeType.StringLiteral:
        return n.value;
      case NodeType.NumberLiteral:
        return (
          toDecimals(n.value, n.power ?? 0) *
          BigInt(timeUnits[n.timeUnit ?? "s"])
        );
      default:
        EVMcrispr.panic(n, "unknown literal expression node");
    }
  };

  #interpretBareword: NodeInterpreter<BarewordNode> = async (n) => {
    return n.value;
  };

  #interpretVariableIdentifier: NodeInterpreter<VariableIdentifierNode> =
    async (n) => {
      const binding = this.bindingsManager.getBindingValue(n.value, USER);

      if (binding !== undefined) {
        return binding;
      }

      EVMcrispr.panic(n, `${n.value} not defined`);
    };

  #setDefaultBindings(): void {
    // No default bindings needed — barewords always return their string value.
    // ETH/XDAI are now module constants accessed via @ETH / @XDAI.
  }

  static panic(n: Node, msg: string): never {
    switch (n.type) {
      case BinaryExpression:
        throw new ExpressionError(n, msg, {
          name: "ArithmeticExpressionError",
        });
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
}
