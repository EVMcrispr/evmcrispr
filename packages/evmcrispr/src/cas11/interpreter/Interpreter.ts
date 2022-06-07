import { ErrorNotFound } from '../../errors';
import type { Helpers } from '../../types';
import { timeUnits, toDecimals } from '../../utils';
import type {
  AST,
  BlockExpressionNode,
  CallExpressionNode,
  CommandExpressionNode,
  HelperFunctionNode,
  IdentifierNode,
  LiteralExpressionNode,
  Node,
  VariableIdentiferNode,
} from '../types';
import { NodeType } from '../types';
import defaultHelpers from '../../helpers';
import type { Module } from '../modules/Module';
import { Core } from '../modules/Core';
import { BindingsManager } from './BindingsManager';

const {
  AddressLiteral,
  BoolLiteral,
  BytesLiteral,
  NumberLiteral,
  StringLiteral,

  BlockExpression,
  CommandExpression,
  CallExpression,
  HelperFunctionExpression,

  Identifier,
  VariableIdentifier,
} = NodeType;

export type NodeResolver = (
  ...args: any[]
) => Promise<any> | Promise<void> | any;

export class Interpreter {
  readonly ast: AST;
  #core: Core;
  #modules: Module[];
  #helpers: Helpers;

  #bindingsManager: BindingsManager;

  constructor(ast: AST) {
    this.ast = ast;
    this.#modules = [];
    this.#helpers = { ...defaultHelpers };

    this.#bindingsManager = new BindingsManager();

    this.#core = new Core(this.#bindingsManager, this.#modules);
  }

  async interpret(): Promise<any> {
    const nodeResolvers = this.interpretNodes(this.ast.body);

    const results = await Promise.all(nodeResolvers.map((r) => r()));

    return results;
  }

  #interpretNode(n: Node): NodeResolver {
    switch (n.type) {
      case AddressLiteral:
      case BoolLiteral:
      case BytesLiteral:
      case StringLiteral:
      case NumberLiteral:
        return this.#interpretLiteral(n as LiteralExpressionNode);

      case BlockExpression:
        return this.#interpretBlockExpression(n as BlockExpressionNode);
      case CallExpression:
        return this.#interpretCallFunction(n as CallExpressionNode);
      case CommandExpression:
        return this.#interpretCommand(n as CommandExpressionNode);
      case HelperFunctionExpression:
        return this.#interpretHelperFunction(n as HelperFunctionNode);
      case Identifier:
        return this.#interpretIdentifier(n as IdentifierNode);
      case VariableIdentifier:
        return this.#interpretVariable(n as VariableIdentiferNode);

      default:
        throw new Error(`Unknown ${n.type} node found`);
    }
  }

  interpretNodes(nodes: Node[]): NodeResolver[] {
    const nodeResolvers: NodeResolver[] = [];
    for (const n of nodes) {
      nodeResolvers.push(this.#interpretNode(n));
    }

    return nodeResolvers;
  }

  #interpretBlockExpression(n: BlockExpressionNode): NodeResolver {
    return async (fn: () => Promise<void>) => {
      this.#bindingsManager.enterScope();

      await fn();

      const res = await this.interpretNodes(n.body);

      this.#bindingsManager.exitScope();

      return res;
    };
  }

  #interpretCallFunction(n: CallExpressionNode): NodeResolver {
    return async () => {
      const args = await Promise.all(
        n.args.map((arg) => this.#interpretNode(arg)),
      );
      console.log(args);

      // TODO: implement call logic
    };
  }

  #interpretCommand(c: CommandExpressionNode): NodeResolver {
    return () => {
      const { module: moduleName, value: commandName } = c.name;

      if (moduleName) {
        const module = this.#modules.find((m) => m.name === moduleName);

        if (!module) {
          throw new ErrorNotFound(`Module ${moduleName} not found`);
        } else if (!module.hasCommand(commandName)) {
          throw new ErrorNotFound(
            `Command ${commandName} not found for module ${moduleName}`,
          );
        }

        return this.#runModuleCommand(c, module);
      }

      // Run core commands first.
      if (this.#core.hasCommand(commandName)) {
        return this.#runModuleCommand(c, this.#core);
      }

      const modules = this.#modules.filter((m) => m.hasCommand(commandName));

      if (modules.length > 1) {
        throw new Error(
          `Command ${commandName} found for the following modules: ${modules
            .map((m) => m.name)
            .join(', ')}`,
        );
      }

      return this.#runModuleCommand(c, modules[0]);
    };
  }

  async #runModuleCommand(
    c: CommandExpressionNode,
    module: Module,
  ): Promise<any> {
    const argNodeResolvers = this.interpretNodes(c.args);

    module.interpretCommand(c.name.value, argNodeResolvers);
  }

  #interpretHelperFunction(n: HelperFunctionNode): NodeResolver {
    return async () => {
      const args = await Promise.all(
        n.args.map((arg) => this.#interpretNode(arg)),
      );
      console.log(args);

      const helperFn = this.#helpers[n.name];

      if (!helperFn) {
        throw new ErrorNotFound(`Helper @${n.name} not found`);
      }

      // TODO: call helper function

      return;
    };
  }

  #interpretLiteral(n: LiteralExpressionNode): NodeResolver {
    return () => {
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
      }
    };
  }

  #interpretIdentifier(n: IdentifierNode): NodeResolver {
    return () => {
      console.log(n);
      // TODO: implement logic
    };
  }

  #interpretVariable(n: VariableIdentiferNode): NodeResolver {
    return () => {
      console.log(n);
      // TODO: implement logic
    };
  }
}
