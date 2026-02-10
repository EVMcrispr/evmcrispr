import Std from "@evmcrispr/module-std";
import type {
  Action,
  ArrayExpressionNode,
  AsExpressionNode,
  BinaryExpressionNode,
  Binding,
  BlockExpressionNode,
  CallExpressionNode,
  CommandExpressionNode,
  CompletionItem,
  HelperFunctionNode,
  IModuleConstructor,
  LiteralExpressionNode,
  Module,
  ModuleContext,
  Node,
  NodeInterpreter,
  NodesInterpreter,
  Position,
  ProbableIdentifierNode,
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
  timeUnits,
  toDecimals,
} from "@evmcrispr/sdk";
import type { Abi, Address, Chain, PublicClient } from "viem";
import { createPublicClient, http, isAddress, zeroAddress } from "viem";
import * as viemChains from "viem/chains";

import {
  getCompletions as getCompletionsImpl,
  getKeywords as getKeywordsImpl,
} from "./completions";
import { parseScript } from "./parsers/script";

const {
  AddressLiteral,
  BoolLiteral,
  BytesLiteral,
  NumberLiteral,
  StringLiteral,

  AsExpression,

  ArrayExpression,

  BinaryExpression,

  BlockExpression,
  CommandExpression,
  CallExpression,
  HelperFunctionExpression,

  ProbableIdentifier,
  VariableIdentifier,
} = NodeType;

const { ABI, ADDR, ALIAS, USER } = BindingsSpace;

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

  constructor(client?: PublicClient, account?: Address) {
    this.bindingsManager = new BindingsManager();
    this.#modules = [];
    this.#nonces = {};
    this.#setDefaultBindings();
    this.#client = client;
    this.#account = account;
    this.#logListeners = [];
    this.#prevMessages = [];
    this.#ipfsResolver = new IPFSResolver();

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

  // ---------------------------------------------------------------------------
  // Public API: interpret, getCompletions, getKeywords
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
    return getCompletionsImpl(
      script,
      position,
      this.#moduleCache,
      this.#client,
    );
  }

  async getKeywords(
    script: string,
  ): Promise<{ commands: string[]; helpers: string[] }> {
    return getKeywordsImpl(script, this.#moduleCache);
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
        transport: http(),
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
      case AsExpression:
        return this.#intrepretAsExpression(n as AsExpressionNode, options);
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
      case ProbableIdentifier:
        return this.#interpretProbableIdentifier(
          n as ProbableIdentifierNode,
          options,
        );
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

  #intrepretAsExpression: NodeInterpreter<AsExpressionNode> = async (
    n,
    options,
  ) => {
    const name = await this.interpretNode(n.left, options);
    const alias = await this.interpretNode(n.right, options);

    this.bindingsManager.setBinding(name, alias, ALIAS);

    return [name, alias];
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

  #interpretProbableIdentifier: NodeInterpreter<ProbableIdentifierNode> =
    async (n, { allowNotFoundError = false, treatAsLiteral = false } = {}) => {
      const identifier = n.value;

      if (!treatAsLiteral) {
        const addressBinding = this.bindingsManager.getBindingValue(
          identifier,
          ADDR,
        );

        if (addressBinding) {
          return addressBinding;
        }

        if (allowNotFoundError) {
          EVMcrispr.panic(n, `identifier "${identifier}" not found`);
        }
      }

      return identifier;
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
    this.bindingsManager.setBinding("XDAI", zeroAddress, ADDR, true);
    this.bindingsManager.setBinding("ETH", zeroAddress, ADDR, true);
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
      case ProbableIdentifier:
        throw new ExpressionError(n, msg, { name: "IdentifierError" });
      case VariableIdentifier:
        throw new ExpressionError(n, msg, { name: "VariableIdentifierError" });
      default:
        throw new ErrorException(msg);
    }
  }
}
