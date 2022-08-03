import type { Signer } from 'ethers';
import { constants } from 'ethers';

import { ErrorException, ErrorNotFound } from '../../errors';
import { timeUnits, toDecimals } from '../../utils';
import type {
  AST,
  ArrayExpressionNode,
  AsExpressionNode,
  BlockExpressionNode,
  CallExpressionNode,
  CommandExpressionNode,
  CommandFunction,
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
import { resolveLazyNodes } from '../utils/resolvers';

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
const IDENTIFIER_FORMATTER = 'identifierFormatter';

type IdentifierFormatter = (identifier: string) => string;

export type LazyNode = {
  type: NodeType;
  resolve: (...args: any[]) => Promise<any> | Promise<void>;
};

export class Interpreter {
  readonly ast: AST;
  #std: Std;
  #modules: Module[];

  #bindingsManager: BindingsManager;

  #signer: Signer;

  constructor(ast: AST, signer: Signer) {
    this.ast = ast;
    this.#modules = [];

    this.#bindingsManager = new BindingsManager();
    this.#setDefaultBindings();

    this.#signer = signer;
    this.#std = new Std(this.#bindingsManager, this.#signer, this.#modules);
  }

  get std(): Std {
    return this.#std;
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

  async interpret(): Promise<any> {
    const lazyNodes = this.#interpretNodes(this.ast.body);

    return (await resolveLazyNodes(lazyNodes, true))
      .flat()
      .filter((result) => typeof result !== 'undefined');
  }

  #interpretNode(n: Node): LazyNode {
    switch (n.type) {
      case AddressLiteral:
      case BoolLiteral:
      case BytesLiteral:
      case StringLiteral:
      case NumberLiteral:
        return this.#interpretLiteral(n as LiteralExpressionNode);

      case AsExpression:
        return this.#intrepretAsExpression(n as AsExpressionNode);
      case ArrayExpression:
        return this.#interpretArrayExpression(n as ArrayExpressionNode);
      case BlockExpression:
        return this.#interpretBlockExpression(n as BlockExpressionNode);
      case CallExpression:
        return this.#interpretCallFunction(n as CallExpressionNode);
      case CommandExpression:
        return this.#interpretCommand(n as CommandExpressionNode);
      case HelperFunctionExpression:
        return this.#interpretHelperFunction(n as HelperFunctionNode);
      case ProbableIdentifier:
        return this.#interpretProbableIdentifier(n as ProbableIdentifierNode);
      case VariableIdentifier:
        return this.#interpretVariableIdentifier(n as VariableIdentiferNode);

      default:
        throw new Error(`Unknown ${n.type} node found`);
    }
  }

  #interpretNodes(nodes: Node[]): LazyNode[] {
    const lazyNodes: LazyNode[] = [];
    for (const n of nodes) {
      lazyNodes.push(this.#interpretNode(n));
    }

    return lazyNodes;
  }

  #interpretArrayExpression(n: ArrayExpressionNode): LazyNode {
    return {
      type: n.type,
      resolve: async () => {
        const lazyNodes = this.#interpretNodes(n.elements);
        return resolveLazyNodes(lazyNodes);
      },
    };
  }

  #intrepretAsExpression(n: AsExpressionNode): LazyNode {
    return {
      type: n.type,
      resolve: async (...args) => {
        const left = await this.#interpretNode(n.left).resolve(args);
        const right = await this.#interpretNode(n.right).resolve(args);

        return [left, right];
      },
    };
  }

  #interpretBlockExpression(n: BlockExpressionNode): LazyNode {
    return {
      type: n.type,
      resolve: async (
        moduleName: string,
        contextMakerFn?: () => Promise<void>,
        identifierFormatter?: IdentifierFormatter,
      ) => {
        this.#bindingsManager.enterScope();

        this.#bindingsManager.setBinding(
          CONTEXTUAL_MODULE,
          moduleName,
          INTERPRETER,
        );

        if (identifierFormatter) {
          this.#bindingsManager.setBinding(
            IDENTIFIER_FORMATTER,
            identifierFormatter,
            INTERPRETER,
          );
        }

        if (contextMakerFn) {
          await contextMakerFn();
        }

        const lazyNodes = this.#interpretNodes(n.body);
        const results = await resolveLazyNodes(lazyNodes, true);

        this.#bindingsManager.exitScope();

        return results;
      },
    };
  }

  #interpretCallFunction(n: CallExpressionNode): LazyNode {
    return {
      type: n.type,
      resolve: async () => {
        const args = await Promise.all(
          n.args.map((arg) => this.#interpretNode(arg)),
        );
        console.log(args);

        // TODO: implement call logic
      },
    };
  }

  #interpretCommand(c: CommandExpressionNode): LazyNode {
    return {
      type: c.type,
      resolve: async () => {
        const { module: moduleName_ } = c.name;
        const moduleName =
          moduleName_ ??
          (this.#bindingsManager.getBinding(CONTEXTUAL_MODULE, INTERPRETER) as
            | string
            | undefined);

        if (moduleName) {
          const module = this.#modules.find((m) =>
            m.alias ? m.alias === moduleName : m.name === moduleName,
          );

          if (!module) {
            throw new ErrorNotFound(`Module ${moduleName} not found`);
          }

          return this.#runModuleCommand(c, module);
        }

        // When the execution flow is on root scope fallback to std module
        return this.#runModuleCommand(c, this.#std);
      },
    };
  }

  #interpretHelperFunction(n: HelperFunctionNode): LazyNode {
    return {
      type: n.type,
      resolve: async () => {
        const helperName = await this.#interpretNode(n.name).resolve();
        const args = await resolveLazyNodes(this.#interpretNodes(n.args));
        const filteredModules = [...this.#modules, this.std].filter(
          (m) => m.helpers[helperName],
        );

        if (!filteredModules.length) {
          throw new ErrorNotFound(`Helper @${helperName} not found`);
        }
        // TODO: Prefix helpers with module name/alias to avoid collisions
        else if (filteredModules.length > 1) {
          throw new ErrorException(
            `Helper @${helperName} name colissions. Found ${filteredModules.length}`,
          );
        }

        const m = filteredModules[0];
        const helper = m.helpers[helperName];

        return helper(...args);
      },
    };
  }

  #interpretLiteral(n: LiteralExpressionNode): LazyNode {
    return {
      type: n.type,
      resolve: async () => {
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
            throw new Error('Unknown LiteralExpressionNode');
        }
      },
    };
  }

  #interpretProbableIdentifier(n: ProbableIdentifierNode): LazyNode {
    return {
      type: n.type,
      resolve: async (treatAsIdentifier = true) => {
        let identifier: string = n.value;

        if (treatAsIdentifier) {
          const identifierFormatter = this.#bindingsManager.getBinding(
            'identifierFormatter',
            INTERPRETER,
          ) as IdentifierFormatter;

          if (identifierFormatter) {
            identifier = identifierFormatter(identifier);
          }

          const binding = this.bindingsManager.getBinding(identifier, ADDR);

          if (binding) {
            return binding;
          }
        }

        return identifier;
      },
    };
  }

  #interpretVariableIdentifier(n: VariableIdentiferNode): LazyNode {
    return {
      type: n.type,
      resolve: async (fallbackToIdentiferName = false) => {
        if (fallbackToIdentiferName) {
          return n.value;
        }

        const binding = this.#bindingsManager.getBinding(n.value, USER);

        if (binding) {
          return binding;
        }

        throw new Error(`${n.value} is not defined`);
      },
    };
  }

  async #runModuleCommand(
    c: CommandExpressionNode,
    module: Module,
  ): ReturnType<CommandFunction<Module>> {
    const lazyNodes = this.#interpretNodes(c.args);

    return module.interpretCommand(c.name.value, lazyNodes, this.#signer);
  }

  #setDefaultBindings(): void {
    this.#bindingsManager.setBinding('XDAI', constants.AddressZero, ADDR, true);
    this.#bindingsManager.setBinding('ETH', constants.AddressZero, ADDR, true);
  }
}
