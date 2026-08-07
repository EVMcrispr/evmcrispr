import type {
  Action,
  CallExpressionNode,
  HelperFunctionNode,
  Node,
  Param,
} from "@evmcrispr/sdk";
import { defineCommand, ErrorException, NodeType, Num } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import type Assertions from "..";
import {
  encodeAssertion,
  operatorFragment,
  resolveCombinatorsContract,
} from "../lib/assertions";
import type { CmpOpName } from "../lib/combinators";
import { encodeCombinator } from "../lib/combinators";
import type { Category, CompilerCtx, Operand } from "../lib/compiler";
import {
  cmpCombine,
  compileBangHelper,
  compileHash,
  compileLenChain,
  compileOperand,
  compileTopCall,
  isBangHelperNode,
} from "../lib/compiler";

const SOLIDITY_TYPE: Record<Category, string> = {
  Uint: "uint256",
  Int: "int256",
  Address: "address",
  Bool: "bool",
  Bytes32: "bytes32",
  String: "string",
  Bytes: "bytes",
};

/** Operators each category supports for a plain (non-indexed) return. */
const PLAIN_OPERATORS: Record<Category, string[]> = {
  Uint: ["Eq", "Ne", "Gt", "Lt", "Ge", "Le", "ApproxEq"],
  Int: ["Eq", "Ne", "Gt", "Lt", "Ge", "Le", "ApproxEq"],
  Address: ["Eq", "Ne"],
  Bool: ["Eq", "Ne"],
  Bytes32: ["Eq", "Ne"],
  String: ["Eq", "Ne"],
  Bytes: ["Eq", "Ne"],
};

/** Operators each category supports when indexing into a tuple return. */
const INDEXED_OPERATORS: Record<Category, string[]> = {
  Uint: ["Eq", "Ne", "Gt", "Lt", "Ge", "Le", "ApproxEq"],
  Int: ["Eq", "Ne", "Gt", "Lt", "Ge", "Le", "ApproxEq"],
  Address: ["Eq", "Ne"],
  Bool: ["Eq", "Ne"],
  Bytes32: ["Eq", "Ne"],
  String: ["Eq", "Ne"],
  Bytes: [],
};

const LENGTH_OPERATORS = ["Eq", "Ne", "Gt", "Lt", "Ge", "Le"];

/** Mirror an operator when the comparison sides are swapped. */
const MIRRORED: Record<string, string> = {
  "==": "==",
  "!=": "!=",
  ">": "<",
  "<": ">",
  ">=": "<=",
  "<=": ">=",
  "~=": "~=",
};

const WRAP_HINT =
  'assert takes `<value> <op> <value> ["message"]` — wrap arithmetic in @num!(…) and boolean logic in @bool!(…)';

function isHelperNamed(node: Node, name: string): node is HelperFunctionNode {
  return (
    node.type === NodeType.HelperFunctionExpression &&
    (node as HelperFunctionNode).name === name
  );
}

function coreSignature(
  fragment: string,
  category: Category,
  indexed: boolean,
  isApprox: boolean,
): string {
  const fnName = `assert${fragment}Call${category}${indexed ? "N" : ""}`;
  const sigParams: string[] = ["address", "bytes"];
  if (indexed) sigParams.push("uint256");
  sigParams.push(SOLIDITY_TYPE[category]);
  if (isApprox) sigParams.push("uint256");
  sigParams.push("string");
  return `${fnName}(${sigParams.join(",")})`;
}

function requireNum(o: Operand & { kind: "const" }, what: string): Num {
  const v = o.value;
  if (v instanceof Num) return v;
  throw new ErrorException(`${what} must be a number, got a ${o.cat} value`);
}

function requireString(o: Operand & { kind: "const" }, what: string): string {
  if (typeof o.value === "string") return o.value;
  throw new ErrorException(`${what} must be a string`);
}

export default defineCommand<Assertions>({
  name: "assert",
  description:
    "Assert that an on-chain expression satisfies a comparison, on-chain.",
  args: [
    {
      name: "call",
      type: "expression",
      description:
        "A `::` call expression or on-chain helper, e.g. `@token(WETH)::balanceOf(@me)` or `@num!(@balance!(ETH @me) + 1e18)`",
    },
    {
      name: "operator",
      type: "string",
      optional: true,
      description: "Comparison operator: ==, !=, >, <, >=, <=, ~=",
    },
    {
      name: "expected",
      type: "expression",
      optional: true,
      description:
        "Expected value — a constant, or another live call/on-chain helper",
    },
    {
      name: "message",
      type: "string",
      optional: true,
      description: "Revert message when the assertion fails",
    },
    {
      name: "extra",
      type: "any",
      rest: true,
      optional: true,
      description:
        "(invalid) trailing tokens — infix expressions must be wrapped in @num!/@bool!",
    },
  ],
  opts: [
    {
      name: "delta",
      type: "number",
      description: "Allowed delta for the ~= (approximate) operator",
    },
  ],
  async run(
    module,
    { call, operator, expected, message, extra },
    { opts, interpreters },
  ): Promise<Action[]> {
    if (Array.isArray(extra) && extra.length > 0) {
      throw new ErrorException(WRAP_HINT);
    }
    const msg = (message as string | undefined) ?? "";
    const ctx: CompilerCtx = {
      module,
      interpreters,
      combinators: await resolveCombinatorsContract(module),
    };

    const lhsNode = call as Node;
    const rhsNode = expected as Node | undefined;

    // ---- @len!: array-length fast path against a constant --------------
    if (isHelperNamed(lhsNode, "len!") && operator !== undefined && rhsNode) {
      const rhs = await compileSide(ctx, rhsNode);
      if (rhs.operand.kind === "const") {
        const fragment = operatorFragment(operator, LENGTH_OPERATORS);
        const chain = await compileLenChain(ctx, lhsNode);
        const [target, data]: [Address, Hex] =
          chain.calls.length === 1
            ? [chain.root, chain.calls[0]]
            : [
                ctx.combinators,
                encodeCombinator("chainCall", [chain.root, chain.calls]),
              ];
        const expectedLen = requireNum(
          rhs.operand,
          "the expected array length",
        );
        const signature = `assert${fragment}CallArrayLength(address,bytes,uint256,string)`;
        return [
          await encodeAssertion(module, signature, [
            target,
            data,
            expectedLen,
            msg,
          ]),
        ];
      }
    }

    // ---- compile both sides -------------------------------------------
    let { operand: lhs, index: lhsIndex } = await compileSide(ctx, lhsNode);

    // Bare assertion (no operator): the value must be a live boolean.
    if (operator === undefined) {
      if (lhs.kind !== "call" || lhs.cat !== "Bool" || lhsIndex !== undefined) {
        throw new ErrorException(
          "assert requires an operator and expected value, e.g. `assert <call> >= <value>` (a bare assert needs a boolean call)",
        );
      }
      if (lhs.notOf) {
        return [
          await encodeAssertion(module, "assertFalse(address,bytes,string)", [
            lhs.notOf.target,
            lhs.notOf.data,
            msg,
          ]),
        ];
      }
      return [
        await encodeAssertion(module, "assertTrue(address,bytes,string)", [
          lhs.target,
          lhs.data,
          msg,
        ]),
      ];
    }

    if (!(operator in MIRRORED)) {
      throw new ErrorException(
        `unknown comparison operator "${operator}". Use one of ${Object.keys(MIRRORED).join(", ")}. ${WRAP_HINT}`,
      );
    }
    if (!rhsNode) {
      throw new ErrorException(
        `operator "${operator}" requires an expected value`,
      );
    }

    let { operand: rhs, index: rhsIndex } = await compileSide(ctx, rhsNode);
    let op = operator as string;
    let liveNode = lhsNode;

    // Put the live side on the left: `5 < $t::f()` ≡ `$t::f() > 5`.
    if (lhs.kind === "const" && rhs.kind === "call") {
      [lhs, rhs] = [rhs, lhs];
      [lhsIndex, rhsIndex] = [rhsIndex, lhsIndex];
      liveNode = rhsNode;
      op = MIRRORED[op];
    }

    if (lhs.kind === "const" && rhs.kind === "const") {
      throw new ErrorException(
        "nothing to assert on-chain — both sides are build-time constants",
      );
    }

    // ---- both sides live: nested comparison judged with assertTrue ----
    if (lhs.kind === "call" && rhs.kind === "call") {
      if (op === "~=") {
        throw new ErrorException(
          "~= needs a constant side — compare two live values with `@num!(@absdiff!(a b)) <= <delta>` instead",
        );
      }
      // Lens-selected sides must re-compile as nested word extractions.
      if (lhsIndex !== undefined) {
        lhs = await compileOperand(ctx, liveNode);
      }
      if (rhsIndex !== undefined) {
        rhs = await compileOperand(ctx, rhsNode);
      }
      const fragment = operatorFragment(op, [
        "Eq",
        "Ne",
        "Gt",
        "Lt",
        "Ge",
        "Le",
      ]);
      const cmp = cmpCombine(ctx, fragment as CmpOpName, lhs, rhs);
      if (cmp.kind !== "call") {
        throw new ErrorException(
          "nothing to assert on-chain — the comparison folded to a constant",
        );
      }
      return [
        await encodeAssertion(module, "assertTrue(address,bytes,string)", [
          cmp.target,
          cmp.data,
          msg,
        ]),
      ];
    }

    // ---- live side vs constant: direct core assertion -----------------
    const live = lhs as Operand & { kind: "call" };
    const cnst = rhs as Operand & { kind: "const" };
    const indexed = lhsIndex !== undefined;
    const category = live.cat;

    const allowed = indexed
      ? INDEXED_OPERATORS[category]
      : PLAIN_OPERATORS[category];
    if (allowed.length === 0) {
      throw new ErrorException(
        `${category.toLowerCase()} returns cannot be tuple-indexed in an assertion`,
      );
    }
    const fragment = operatorFragment(op, allowed);

    // Booleans fold != into the Eq surface (there is no assertNeCallBool).
    if (category === "Bool") {
      if (cnst.cat !== "Bool") {
        throw new ErrorException(
          "a boolean return must be compared against true or false",
        );
      }
      const value = cnst.value === true;
      const keep = value === (fragment === "Eq");
      if (indexed) {
        return [
          await encodeAssertion(
            module,
            "assertEqCallBoolN(address,bytes,uint256,bool,string)",
            [
              live.target,
              live.data,
              Num.fromBigInt(BigInt(lhsIndex!)),
              keep,
              msg,
            ],
          ),
        ];
      }
      const inner = live.notOf ?? { target: live.target, data: live.data };
      // assertTrue(notBool(x)) ≡ assertFalse(x): drop the wrapper when we can.
      const wantTrue = live.notOf ? !keep : keep;
      return [
        await encodeAssertion(
          module,
          `${wantTrue ? "assertTrue" : "assertFalse"}(address,bytes,string)`,
          [inner.target, inner.data, msg],
        ),
      ];
    }

    const isApprox = fragment === "ApproxEq";
    let delta: Num | undefined;
    if (isApprox) {
      if (opts.delta === undefined) {
        throw new ErrorException("the ~= operator requires a --delta value");
      }
      delta = opts.delta;
    }

    // Strings only exist as the tuple-indexed variant; a plain string
    // return is index 0 of its own tuple.
    const forceIndexed = category === "String";
    const useIndexed = indexed || forceIndexed;
    const index = lhsIndex ?? 0;

    let expectedParam: Param;
    switch (category) {
      case "Uint": {
        const num = requireNum(cnst, "the expected value");
        if (num.lt(Num(0n))) {
          throw new ErrorException(
            "cannot compare an unsigned return against a negative value — cast the return as int256 with an inline ABI, e.g. ::{method()(int256)}",
          );
        }
        expectedParam = num;
        break;
      }
      case "Int":
        expectedParam = requireNum(cnst, "the expected value");
        break;
      case "Address": {
        if (cnst.cat !== "Address") {
          throw new ErrorException(
            "an address return must be compared against an address",
          );
        }
        expectedParam = cnst.value as string;
        break;
      }
      case "Bytes32": {
        if (cnst.cat !== "Bytes32") {
          throw new ErrorException(
            "a bytes32 return must be compared against a 32-byte hex value",
          );
        }
        expectedParam = cnst.value as string;
        break;
      }
      case "Bytes": {
        if (cnst.cat !== "Bytes" && cnst.cat !== "Bytes32") {
          throw new ErrorException(
            "a bytes return must be compared against a hex value",
          );
        }
        expectedParam = cnst.value as string;
        break;
      }
      case "String":
        expectedParam = requireString(cnst, "the expected value");
        break;
      default:
        throw new ErrorException(`unsupported category ${category}`);
    }

    const signature = coreSignature(fragment, category, useIndexed, isApprox);
    const params: Param[] = [live.target, live.data];
    if (useIndexed) params.push(Num.fromBigInt(BigInt(index)));
    params.push(expectedParam);
    if (isApprox && delta) params.push(delta);
    params.push(msg);

    return [await encodeAssertion(module, signature, params)];
  },
});

/** Compile one side of the assertion, keeping a top-level lens index. */
async function compileSide(
  ctx: CompilerCtx,
  node: Node,
): Promise<{ operand: Operand; index?: number }> {
  if (node.type === NodeType.CallExpression) {
    return compileTopCall(ctx, node as CallExpressionNode);
  }
  if (isHelperNamed(node, "hash!")) {
    const data = await compileHash(ctx, node);
    return {
      operand: {
        kind: "call",
        target: ctx.combinators,
        data,
        cat: "Bytes32",
      },
    };
  }
  if (isBangHelperNode(node)) {
    return { operand: await compileBangHelper(ctx, node) };
  }
  return { operand: await compileOperand(ctx, node) };
}
