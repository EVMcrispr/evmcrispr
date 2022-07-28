import type { Signer } from 'ethers';

import { ErrorNotFound } from '../../errors';
import { timeUnits, toDecimals } from '../../utils';
import type {
  AST,
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
// import defaultHelpers from '../../helpers';
import type { Module } from '../modules/Module';
import { Std } from '../modules/std/Std';
import { BindingsManager } from './BindingsManager';

const {
  AddressLiteral,
  BoolLiteral,
  BytesLiteral,
  NumberLiteral,
  StringLiteral,

  AsExpression,

  BlockExpression,
  CommandExpression,
  CallExpression,
  HelperFunctionExpression,

  ProbableIdentifier,
  VariableIdentifier,
} = NodeType;

export type LazyNode = {
  type: NodeType;
  execute: (...args: any[]) => Promise<any> | Promise<void>;
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
    this.#std = new Std(this.#bindingsManager, this.#modules);
    this.#signer = signer;
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

  getBinding(name: string, isUserVariable = false): any {
    return this.#bindingsManager.getBinding(name, isUserVariable);
  }

  async interpret(): Promise<any> {
    const lazyNodes = this.#interpretNodes(this.ast.body);
    const results: any = [];

    for (const lazyNode of lazyNodes) {
      const result = await lazyNode.execute();
      if (Array.isArray(result)) {
        results.push(...result);
      } else {
        results.push(result);
      }
    }

    return results;
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
    const nodeResolvers: LazyNode[] = [];
    for (const n of nodes) {
      nodeResolvers.push(this.#interpretNode(n));
    }

    return nodeResolvers;
  }

  #intrepretAsExpression(n: AsExpressionNode): LazyNode {
    return {
      type: n.type,
      execute: async (...args) => {
        const left = await this.#interpretNode(n.left).execute(args);
        const right = await this.#interpretNode(n.right).execute(args);

        return [left, right];
      },
    };
  }
  #interpretBlockExpression(n: BlockExpressionNode): LazyNode {
    return {
      type: n.type,
      execute: async (fn: () => Promise<void>) => {
        this.#bindingsManager.enterScope();

        await fn();

        const res = this.#interpretNodes(n.body);

        this.#bindingsManager.exitScope();

        return res;
      },
    };
  }

  #interpretCallFunction(n: CallExpressionNode): LazyNode {
    return {
      type: n.type,
      execute: async () => {
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
      execute: async () => {
        const { module: moduleName, value: commandName } = c.name;

        if (moduleName) {
          const module = this.#modules.find((m) =>
            m.alias ? m.alias === moduleName : m.name === moduleName,
          );

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
        if (this.#std.hasCommand(commandName)) {
          return this.#runModuleCommand(c, this.#std);
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

  #interpretHelperFunction(n: HelperFunctionNode): LazyNode {
    return {
      type: n.type,
      execute: async () => {
        console.log(n);
        // const args = await Promise.all(
        //   n.args.map((arg) => this.#interpretNode(arg)),
        // );
        // console.log(args);

        // const helperFn = this.#helpers[n.name];

        // if (!helperFn) {
        //   throw new ErrorNotFound(`Helper @${n.name} not found`);
        // }

        // TODO: call helper function

        return;
      },
    };
  }

  #interpretLiteral(n: LiteralExpressionNode): LazyNode {
    return {
      type: n.type,
      execute: async () => {
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
      execute: async (treatAsIdentifier = true) => {
        if (treatAsIdentifier) {
          const binding = this.getBinding(n.value);
          if (binding) {
            return binding;
          }
        }

        return n.value;
      },
    };
  }

  #interpretVariableIdentifier(n: VariableIdentiferNode): LazyNode {
    return {
      type: n.type,
      execute: async (fallbackToIdentiferName = false) => {
        if (fallbackToIdentiferName) {
          return n.value;
        }

        const binding = this.getBinding(n.value, true);

        if (binding) {
          return binding;
        }

        throw new Error(`${n.value} is not defined`);
      },
    };
  }
}
