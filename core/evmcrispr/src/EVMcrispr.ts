import type { Signer, providers } from 'ethers';
import { BigNumber, Contract, constants, ethers, utils } from 'ethers';

import { BindingsManager } from './BindingsManager';
import type { Cas11AST } from './Cas11AST';
import { IPFSResolver } from './IPFSResolver';
import type { Module } from './Module';
import {
  CommandError,
  ErrorException,
  ExpressionError,
  HelperFunctionError,
  NodeError,
} from './errors';
import { Std } from './std/Std';
import { BindingsSpace, NodeType } from './types';
import type {
  Action,
  Address,
  ArrayExpressionNode,
  AsExpressionNode,
  BinaryExpressionNode,
  BlockExpressionNode,
  CallExpressionNode,
  CommandExpressionNode,
  HelperFunctionNode,
  LiteralExpressionNode,
  Node,
  ProbableIdentifierNode,
  RelativeBinding,
  VariableIdentifierNode,
} from './types';
import type { NodeInterpreter, NodesInterpreter } from './types/modules';
import { timeUnits, toDecimals } from './utils';

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
  readonly ast: Cas11AST;
  readonly bindingsManager: BindingsManager;

  #std: Std;
  #modules: Module[];
  #nonces: Record<string, number>;
  #account: Address | undefined;
  #chainId: number | undefined;
  #getSigner: () => Promise<Signer>;

  #logListeners: ((message: string, prevMessages: string[]) => void)[];
  #prevMessages: string[];

  #provider: providers.Provider | undefined;

  constructor(ast: Cas11AST, getSigner: () => Promise<Signer>) {
    this.ast = ast;

    this.bindingsManager = new BindingsManager();
    this.#modules = [];
    this.#nonces = {};
    this.#setDefaultBindings();
    this.#getSigner = getSigner;
    this.#logListeners = [];
    this.#prevMessages = [];

    this.#std = new Std(
      this.bindingsManager,
      this.#nonces,
      this,
      new IPFSResolver(),
      this.#modules,
    );
  }

  async getChainId(): Promise<number> {
    return (
      this.#chainId ??
      this.#getSigner()
        .then((signer) => signer.provider!.getNetwork())
        .then(({ chainId }: any) => chainId)
    );
  }

  setProvider(provider: providers.Provider | undefined): void {
    this.#provider = provider;
  }

  async getProvider(): Promise<providers.Provider> {
    if (this.#provider) {
      return this.#provider;
    }
    const signer = await this.#getSigner();
    if (
      !this.#chainId ||
      this.#chainId ===
        Number(
          await signer
            .provider!.getNetwork()
            .then(({ chainId }: any) => chainId),
        )
    ) {
      return signer.provider!;
    }
    switch (this.#chainId) {
      case 100:
        return new ethers.providers.JsonRpcProvider(
          'https://rpc.gnosischain.com',
          this.#chainId,
        );
      default:
        return ethers.getDefaultProvider(this.#chainId);
    }
  }

  setConnectedAccount(account: string | undefined): void {
    this.#account = account;
  }

  async getConnectedAccount(retreiveInjected = false): Promise<Address> {
    return !retreiveInjected && this.#account
      ? this.#account
      : this.#getSigner().then((signer) => signer.getAddress());
  }

  async switchChainId(chainId: number): Promise<providers.Provider> {
    this.#chainId = chainId;
    return this.getProvider();
  }

  getBinding<BSpace extends BindingsSpace>(
    name: string,
    memSpace: BSpace,
  ): RelativeBinding<BSpace>['value'] | undefined {
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

  async interpret(
    actionCallback?: (action: Action) => Promise<void>,
  ): Promise<Action[]> {
    const results = await this.interpretNodes(this.ast.body, true, {
      actionCallback,
    });

    return results.flat().filter((result) => typeof result !== 'undefined');
  }

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

    let leftOperand: BigNumber, rightOperand: BigNumber;

    try {
      leftOperand = BigNumber.from(leftOperand_);
    } catch (err) {
      EVMcrispr.panic(
        n,
        `invalid left operand. Expected a number but got "${leftOperand_}"`,
      );
    }

    try {
      rightOperand = BigNumber.from(rightOperand_);
    } catch (err) {
      EVMcrispr.panic(
        n,
        `invalid right operand. Expected a number but got "${rightOperand_}"`,
      );
    }

    switch (n.operator) {
      case '+':
        return leftOperand.add(rightOperand);
      case '-':
        return leftOperand.sub(rightOperand);
      case '*':
        return leftOperand.mul(rightOperand);
      case '/': {
        if (rightOperand.eq(0)) {
          EVMcrispr.panic(n, `invalid operation. Can't divide by zero`);
        }
        return leftOperand.div(rightOperand);
      }
      case '^': {
        return leftOperand.pow(rightOperand);
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

    if (!utils.isAddress(targetAddress)) {
      EVMcrispr.panic(
        n,
        `invalid target. Expected an address, but got ${targetAddress}`,
      );
    }

    const targetInterface = this.bindingsManager.getBindingValue(
      targetAddress,
      ABI,
    ) as utils.Interface | undefined;
    if (!targetInterface) {
      EVMcrispr.panic(n, `no ABI found for ${targetAddress}`);
    }

    const contract = new Contract(
      targetAddress,
      targetInterface,
      await this.getProvider(),
    );
    let res;

    try {
      res = await contract[n.method](...args);
    } catch (err) {
      const err_ = err as Error;

      EVMcrispr.panic(
        n,
        `error occured whe calling ${n.target.value ?? targetAddress}: ${
          err_.message
        }`,
      );
    }

    return res;
  };

  #interpretCommand: NodeInterpreter<CommandExpressionNode> = async (
    c,
    { actionCallback } = {},
  ) => {
    let module: Module | undefined = this.#std;
    const moduleName = c.module ?? this.bindingsManager.getScopeModule();

    if (moduleName && moduleName !== 'std') {
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
      if (err instanceof NodeError) {
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
      EVMcrispr.panic(h, 'helper not found on any module');
    }

    // TODO: Prefix helpers with module name/alias to avoid collisions
    else if (filteredModules.length > 1) {
      EVMcrispr.panic(
        h,
        `name collisions found on modules ${filteredModules.join(', ')}`,
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
        return toDecimals(n.value, n.power ?? 0).mul(
          timeUnits[n.timeUnit ?? 's'],
        );
      default:
        EVMcrispr.panic(n, 'unknown literal expression node');
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

      if (binding) {
        return binding;
      }

      EVMcrispr.panic(n, `${n.value} not defined`);
    };

  #setDefaultBindings(): void {
    this.bindingsManager.setBinding('XDAI', constants.AddressZero, ADDR, true);
    this.bindingsManager.setBinding('ETH', constants.AddressZero, ADDR, true);
  }

  static panic(n: Node, msg: string): never {
    switch (n.type) {
      case BinaryExpression:
        throw new ExpressionError(n, msg, {
          name: 'ArithmeticExpressionError',
        });
      case CommandExpression:
        throw new CommandError(n as CommandExpressionNode, msg);
      case HelperFunctionExpression:
        throw new HelperFunctionError(n as HelperFunctionNode, msg);
      case ProbableIdentifier:
        throw new ExpressionError(n, msg, { name: 'IdentifierError' });
      case VariableIdentifier:
        throw new ExpressionError(n, msg, { name: 'VariableIdentifierError' });
      default:
        throw new ErrorException(msg);
    }
  }
}
