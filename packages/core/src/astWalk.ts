import type {
  ArrayExpressionNode,
  CallExpressionNode,
  CommandExpressionNode,
  HelperFunctionNode,
  NamedArgNode,
  Node,
} from "@evmcrispr/sdk";
import { NodeType } from "@evmcrispr/sdk";

/**
 * Neutral AST walks over a command line's expressions. Shared by the
 * interpreter, the analyzer and the editor, so it must stay free of
 * interpreter and module-schema dependencies.
 */

/**
 * Every helper node reachable inside an argument expression, in source
 * order. Descends helper arguments, array elements, call targets and
 * arguments, and named arguments. Never descends into a block body: a
 * block's lines are commands of their own, not expressions this line
 * evaluates.
 */
export function collectHelpers(node: Node, out: HelperFunctionNode[]): void {
  switch (node.type) {
    case NodeType.HelperFunctionExpression: {
      const h = node as HelperFunctionNode;
      out.push(h);
      for (const a of h.args) collectHelpers(a, out);
      break;
    }
    case NodeType.ArrayExpression:
      for (const el of (node as ArrayExpressionNode).elements) {
        collectHelpers(el, out);
      }
      break;
    case NodeType.CallExpression: {
      const call = node as CallExpressionNode;
      collectHelpers(call.target, out);
      for (const a of call.args) collectHelpers(a, out);
      break;
    }
    case NodeType.NamedArg:
      collectHelpers((node as NamedArgNode).value, out);
      break;
    default:
      break;
  }
}

/** Whether the line is std's `load` (qualified or not). */
export function isLoadCommand(c: CommandExpressionNode): boolean {
  return (c.module ?? "std") === "std" && c.name === "load";
}

/**
 * Every helper invocation a command line evaluates: the helpers reachable
 * in its arguments and option values, in source order. A `load` import
 * list holds helper *names*, not invocations, so it is skipped.
 */
export function lineHelpers(c: CommandExpressionNode): HelperFunctionNode[] {
  const helpers: HelperFunctionNode[] = [];
  const skip = isLoadCommand(c) ? c.args[1] : undefined;
  for (const arg of c.args) {
    if (arg === skip) continue;
    collectHelpers(arg, helpers);
  }
  for (const opt of c.opts) collectHelpers(opt.value, helpers);
  return helpers;
}
