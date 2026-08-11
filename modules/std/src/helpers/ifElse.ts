import type { Node, Param } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { CompileCtx, Operand } from "@evmcrispr/sdk/onchain";
import {
  branchCompatible,
  compileExpr,
  compileOperand,
  coreCall,
  encodeCond,
  materializeWord,
  scaleOf,
} from "@evmcrispr/sdk/onchain";
import type Std from "..";
import {
  evaluateArithmeticExpr,
  evaluateBoolExpr,
  isTruthy,
  validateNoEmbeddedOps,
} from "./_expr";

const SHAPE_HINT =
  "e.g. @ifElse($vault::{paused()(bool)} ? $safe : $vault) — the `?` and `:` need spaces around them";

const bareword = (n: Node): string | undefined =>
  n.type === NodeType.Bareword
    ? (n as unknown as { value: string }).value
    : undefined;

/** Operators that make a multi-token branch a BOOLEAN expression; anything
 *  else multi-token is arithmetic. Mirrors the @bool!/@num! split. */
const BOOL_OPS = new Set([
  "and",
  "or",
  "xor",
  "not",
  "==",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
]);

/** A parsed ternary tree: nested ternaries must be parenthesized, so each
 *  level has exactly one depth-0 `?`/`:` pair; a leaf is a token run — a
 *  single value node or an expression for the @bool!/@num! engines. */
type Ternary =
  | { kind: "ternary"; condition: Node[]; then_: Ternary; else_: Ternary }
  | { kind: "tokens"; nodes: Node[] };

/** Positions of a bareword at paren depth 0 (parens arrive as `(`/`)`
 *  bareword tokens). */
function depth0Positions(nodes: Node[], token: string): number[] {
  const positions: number[] = [];
  let depth = 0;
  for (let i = 0; i < nodes.length; i++) {
    const word = bareword(nodes[i]);
    if (word === "(") depth++;
    else if (word === ")") depth--;
    else if (word === token && depth === 0) positions.push(i);
  }
  return positions;
}

/** Whether the run is one balanced paren group, `( … )` end to end. */
function fullyParenthesized(nodes: Node[]): boolean {
  if (nodes.length < 2 || bareword(nodes[0]) !== "(") return false;
  let depth = 0;
  for (let i = 0; i < nodes.length; i++) {
    const word = bareword(nodes[i]);
    if (word === "(") depth++;
    else if (word === ")") {
      depth--;
      if (depth === 0) return i === nodes.length - 1;
    }
  }
  return false;
}

function parsePart(nodes: Node[]): Ternary {
  // A fully-parenthesized run is one sub-expression: strip the parens and
  // look again — this is how a nested ternary rides a branch, e.g.
  // `$a ? ($b ? $c : $d) : $f`.
  if (fullyParenthesized(nodes)) return parsePart(nodes.slice(1, -1));

  const qs = depth0Positions(nodes, "?");
  if (qs.length === 0) return { kind: "tokens", nodes };
  if (qs.length > 1) {
    throw new ErrorException(
      "@ifElse found more than one `?` at the same level — parenthesize nested ternaries, e.g. $a ? ($b ? $c : $d) : $e",
    );
  }
  const q = qs[0];
  const cs = depth0Positions(nodes, ":").filter((i) => i > q);
  if (cs.length === 0) {
    throw new ErrorException(
      `@ifElse is a ternary: <condition> ? <then> : <else>, ${SHAPE_HINT}`,
    );
  }
  if (cs.length > 1) {
    throw new ErrorException(
      "@ifElse found more than one `:` at the same level — parenthesize nested ternaries, e.g. $a ? $b : ($c ? $d : $e)",
    );
  }
  const c = cs[0];
  if (q === 0) {
    throw new ErrorException(
      `@ifElse needs a condition before the \`?\`, ${SHAPE_HINT}`,
    );
  }
  const thenNodes = nodes.slice(q + 1, c);
  const elseNodes = nodes.slice(c + 1);
  if (thenNodes.length === 0 || elseNodes.length === 0) {
    throw new ErrorException(`@ifElse branches cannot be empty, ${SHAPE_HINT}`);
  }
  return {
    kind: "ternary",
    condition: nodes.slice(0, q),
    then_: parsePart(thenNodes),
    else_: parsePart(elseNodes),
  };
}

function parseTernary(nodes: Node[]): Ternary & { kind: "ternary" } {
  const part = parsePart(nodes);
  if (part.kind !== "ternary") {
    throw new ErrorException(
      `@ifElse is a ternary: <condition> ? <then> : <else>, ${SHAPE_HINT}`,
    );
  }
  return part;
}

const exprMode = (nodes: Node[]): "bool" | "num" =>
  nodes.some((n) => BOOL_OPS.has(bareword(n) ?? "")) ? "bool" : "num";

/** Word-shaped categories the on-chain condition accepts as a single
 *  operand: the core judges the FIRST RESOLVED WORD, nonzero = then (EVM
 *  truthiness), so any word composes directly. */
const WORD_CONDITION = new Set(["Bool", "Uint", "Int", "Address", "Bytes32"]);

export default defineHelper<Std>({
  name: "ifElse",
  description:
    "A ternary over live reads: `cond ? then : else`, evaluating only the winning branch. Parenthesized ternaries nest as branches.",
  compileDescription:
    "Compiles to the core's lazy `cond`: the condition's first resolved word judges (nonzero = then) and the losing branch is never resolved.",
  returnType: "any",
  args: [
    {
      name: "expression",
      type: "any",
      // The whole token stream arrives raw: which branch is worth
      // evaluating depends on the condition, so the branches must not be
      // resolved before the helper runs.
      lazy: true,
      rest: true,
      description:
        "`cond ? then : else` — a bool-expression condition, then two branches: values, expressions, or parenthesized nested ternaries",
    },
  ],
  async run(_module, { expression }, { interpreters }) {
    const { interpretNode, interpretNodes } = interpreters;

    const evalCondition = async (condition: Node[]): Promise<boolean> => {
      if (condition.length === 1) {
        const value = await interpretNode(condition[0]);
        validateNoEmbeddedOps(value, "boolean");
        return isTruthy(value);
      }
      return evaluateBoolExpr(await interpretNodes(condition));
    };

    const evalPart = async (part: Ternary): Promise<Param> => {
      if (part.kind === "tokens") {
        if (part.nodes.length === 1) {
          return (await interpretNode(part.nodes[0])) as Param;
        }
        const values = await interpretNodes(part.nodes);
        return exprMode(part.nodes) === "bool"
          ? evaluateBoolExpr(values)
            ? "true"
            : "false"
          : evaluateArithmeticExpr(values);
      }
      // Only the winning branch is evaluated — the loser may be a read
      // that reverts, which is often the point of branching.
      const truthy = await evalCondition(part.condition);
      return evalPart(truthy ? part.then_ : part.else_);
    };

    return evalPart(parseTernary((expression ?? []) as Node[]));
  },
  compile: async (ctx, node) => compilePart(ctx, parseTernary(node.args)),
});

async function compilePart(ctx: CompileCtx, part: Ternary): Promise<Operand> {
  if (part.kind === "tokens") {
    return part.nodes.length === 1
      ? compileOperand(ctx, part.nodes[0])
      : compileExpr(ctx, part.nodes, exprMode(part.nodes));
  }

  const cond =
    part.condition.length === 1
      ? await compileOperand(ctx, part.condition[0])
      : await compileExpr(ctx, part.condition, "bool");
  if (!WORD_CONDITION.has(cond.cat)) {
    throw new ErrorException(
      `@ifElse! needs a word-shaped condition, got a ${cond.cat} value — the core judges the first resolved word (nonzero = then)`,
    );
  }

  // A build-time condition decides at build time: fold to the winning
  // branch and the loser is not even compiled into the operand.
  if (cond.kind === "const") {
    return compilePart(ctx, isTruthy(cond.value) ? part.then_ : part.else_);
  }

  const branch = async (p: Ternary, side: string): Promise<Operand> => {
    const o = await compilePart(ctx, p);
    if (o.kind === "const" && (o.cat === "String" || o.cat === "Bytes")) {
      // materializeWord encodes a constant as one raw word; a string or
      // bytes literal is not word-shaped, and the core splices words.
      throw new ErrorException(
        `@ifElse! cannot use a string or bytes constant as its ${side} branch — read it on-chain instead`,
      );
    }
    return o;
  };
  const thenOp = await branch(part.then_, "then");
  const elseOp = await branch(part.else_, "else");
  if (!branchCompatible(thenOp.cat, elseOp.cat)) {
    throw new ErrorException(
      `@ifElse! branches must resolve to the same kind of value, got ${thenOp.cat} and ${elseOp.cat} — the judge compares whichever one wins`,
    );
  }
  // Two words only mean the same thing at the same scale: a ray-rate
  // then-branch and a wad else-branch would judge as different numbers
  // depending on the condition.
  const scale = scaleOf(thenOp);
  if (scale !== scaleOf(elseOp)) {
    throw new ErrorException(
      "@ifElse! branches carry different scales — align them (e.g. read both at the same precision) before branching",
    );
  }

  const result = coreCall(
    ctx,
    encodeCond(
      cond.param,
      materializeWord(ctx, thenOp),
      materializeWord(ctx, elseOp),
    ),
    thenOp.cat,
  );
  return scale ? { ...result, scale } : result;
}
