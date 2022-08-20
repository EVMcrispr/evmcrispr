import type { Signer } from 'ethers';
import { constants } from 'ethers';

import {
  CommandError,
  ErrorException,
  ExpressionError,
  HelperFunctionError,
} from '../../errors';
import { timeUnits, toDecimals } from '../../utils';
import type {
  AST,
  ArrayExpressionNode,
  AsExpressionNode,
  BlockExpressionNode,
  CallExpressionNode,
  CommandExpressionNode,
  HelperFunctionNode,
  LiteralExpressionNode,
  Node,
  ProbableIdentifierNode,
  VariableIdentiferNode,
} from '../types';
import { NodeType } from '../types';
import type { Module } from '../modules/Module';
import { Std } from '../modules/std/Std';
import { BindingsManager, BindingsSpace } from './BindingsManager';
import type { NodeInterpreter, NodesInterpreter } from '../types/modules';

const {
  AddressLiteral,
  BoolLiteral,
  BytesLiteral,
  NumberLiteral,
  StringLiteral,

  AsExpression,

  ArrayExpression,

  BlockExpression,
  CommandExpression,
  CallExpression,
  HelperFunctionExpression,

  ProbableIdentifier,
  VariableIdentifier,
} = NodeType;

const { ADDR, INTERPRETER, USER } = BindingsSpace;

// Interpreter bindings

// Implicit module use inside block expressions
const CONTEXTUAL_MODULE = 'contextualModule';

export class Interpreter {
  readonly ast: AST;
  #std: Std;
  #modules: Module[] = [];

  #bindingsManager: BindingsManager;
  #nonces: Record<string, number> = {};

  #signer: Signer;

  constructor(ast: AST, signer: Signer) {
    this.ast = ast;

    this.#bindingsManager = new BindingsManager();
    this.#setDefaultBindings();

    this.#signer = signer;
    this.#std = new Std(
      this.#bindingsManager,
      this.#nonces,
      this.#signer,
      this.#modules,
    );
  }

  get bindingsManager(): BindingsManager {
    return this.#bindingsManager;
  }

  set signer(signer: Signer) {
    this.#signer = signer;
  }

  getBinding(name: string, memSpace: BindingsSpace): any {
    return this.#bindingsManager.getBinding(name, memSpace);
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

  async interpret(): Promise<any> {
    const results = await this.interpretNodes(this.ast.body, true);

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
          n as VariableIdentiferNode,
          options,
        );

      default:
        Interpreter.panic(n, `unknown ${n.type} node found`);
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

  #interpretArrayExpression: NodeInterpreter<ArrayExpressionNode> = (n) => {
    return this.interpretNodes(n.elements);
  };

  #intrepretAsExpression: NodeInterpreter<AsExpressionNode> = async (
    n,
    options,
  ) => {
    const left = await this.interpretNode(n.left, options);
    const right = await this.interpretNode(n.right, options);

    return [left, right];
  };

  #interpretBlockExpression: NodeInterpreter<BlockExpressionNode> = async (
    n,
    { blockInitializer, blockModule } = {},
  ) => {
    this.#bindingsManager.enterScope();

    this.#bindingsManager.setBinding(
      CONTEXTUAL_MODULE,
      blockModule,
      INTERPRETER,
    );

    if (blockInitializer) {
      await blockInitializer();
    }

    const results = await this.interpretNodes(n.body, true);

    this.#bindingsManager.exitScope();

    return results;
  };

  #interpretCallFunction: NodeInterpreter<CallExpressionNode> = async (n) => {
    console.log(n);

    return '';
  };

  #interpretCommand: NodeInterpreter<CommandExpressionNode> = (c) => {
    let module: Module | undefined = this.#std;
    const moduleName =
      c.module ??
      (this.#bindingsManager.getBinding(CONTEXTUAL_MODULE, INTERPRETER) as
        | string
        | undefined);

    if (moduleName && moduleName !== 'std') {
      module = this.#modules.find((m) => m.contextualName === moduleName);

      if (!module) {
        Interpreter.panic(c, `module ${moduleName} not found`);
      }
    }

    return module.interpretCommand(c, {
      interpretNode: this.interpretNode,
      interpretNodes: this.interpretNodes,
    });
  };

  #interpretHelperFunction: NodeInterpreter<HelperFunctionNode> = async (h) => {
    const helperName = h.name;
    const filteredModules = [...this.#modules, this.#std].filter(
      (m) => !!m.helpers[helperName],
    );

    if (!filteredModules.length) {
      Interpreter.panic(h, 'helper not found on any module');
    }

    // TODO: Prefix helpers with module name/alias to avoid collisions
    else if (filteredModules.length > 1) {
      Interpreter.panic(
        h,
        `name collisions found on modules ${filteredModules.join(', ')}`,
      );
    }

    const m = filteredModules[0];

    return m.interpretHelper(h, {
      interpretNode: this.interpretNode,
      interpretNodes: this.interpretNodes,
    });
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
        Interpreter.panic(n, 'unknown literal expression node');
    }
  };

  #interpretProbableIdentifier: NodeInterpreter<ProbableIdentifierNode> =
    async (n, { allowNotFoundError = false, treatAsLiteral = false } = {}) => {
      const identifier = n.value;

      if (!treatAsLiteral) {
        const addressBinding = this.bindingsManager.getBinding(
          identifier,
          ADDR,
        );

        if (addressBinding) {
          return addressBinding;
        }

        if (allowNotFoundError) {
          Interpreter.panic(n, `identifier "${identifier}" not found`);
        }
      }

      return identifier;
    };

  #interpretVariableIdentifier: NodeInterpreter<VariableIdentiferNode> = (
    n,
  ) => {
    const binding = this.#bindingsManager.getBinding(n.value, USER);

    if (binding) {
      return binding;
    }

    Interpreter.panic(n, `$${n.value} not defined`);
  };

  #setDefaultBindings(): void {
    this.#bindingsManager.setBinding('XDAI', constants.AddressZero, ADDR, true);
    this.#bindingsManager.setBinding('ETH', constants.AddressZero, ADDR, true);
  }

  static panic(n: Node, msg: string): never {
    switch (n.type) {
      case CommandExpression:
        throw new CommandError((n as CommandExpressionNode).name, msg);
      case HelperFunctionExpression:
        throw new HelperFunctionError((n as HelperFunctionNode).name, msg);
      case ProbableIdentifier:
        throw new ExpressionError(msg, { name: 'IdentifierError' });
      case VariableIdentifier:
        throw new ExpressionError(msg, { name: 'VariableIdentifierError' });
      default:
        throw new ErrorException(msg);
    }
  }
}
