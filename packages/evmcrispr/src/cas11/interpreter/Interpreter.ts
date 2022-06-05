import { timeUnits, toDecimals } from '../../utils';
import type { AST, LiteralExpressionNode, Node } from '../types';
import { NodeType } from '../types';

const {
  AddressLiteral,
  BoolLiteral,
  BytesLiteral,
  NumberLiteral,
  StringLiteral,
} = NodeType;

export type NodeResolver = (
  ...args: any[]
) => Promise<any> | Promise<void> | any;

export class Interpreter {
  readonly ast: AST;

  constructor(ast: AST) {
    this.ast = ast;
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
}
