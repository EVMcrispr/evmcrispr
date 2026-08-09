import type { Action, CallExpressionNode, Node } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, NodeType, Num } from "@evmcrispr/sdk";
import { encodeAbiParameters, isHex, keccak256 } from "viem";
import type Assertions from "..";
import {
  assertParamAction,
  operatorFragment,
  resolveCombinatorsContract,
} from "../lib/assertions";
import { encodeData } from "../lib/combinators";
import type { Category, CompilerCtx, Operand } from "../lib/compiler";
import {
  cmpCombine,
  compileBangHelper,
  compileOperand,
  compileTopCall,
  isBangHelperNode,
  stringEnvelopeDigest,
} from "../lib/compiler";
import type { InputParam } from "../lib/erc8211";
import { constraint, staticCallParam } from "../lib/erc8211";
import { calcJudge, judged, wordJudge } from "../lib/judge";

/** Operators each category supports at the top level of an assertion. */
const PLAIN_OPERATORS: Record<Category, string[]> = {
  Uint: ["Eq", "Ne", "Gt", "Lt", "Ge", "Le", "ApproxEq"],
  Int: ["Eq", "Ne", "Gt", "Lt", "Ge", "Le", "ApproxEq"],
  Address: ["Eq", "Ne"],
  Bool: ["Eq", "Ne"],
  Bytes32: ["Eq", "Ne"],
  String: ["Eq", "Ne"],
  Bytes: ["Eq", "Ne"],
};

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

function requireNum(o: Operand & { kind: "const" }, what: string): Num {
  const v = o.value;
  if (v instanceof Num) return v;
  throw new ErrorException(`${what} must be a number, got a ${o.cat} value`);
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
    const emit = async (param: InputParam): Promise<Action[]> => [
      await assertParamAction(module, param, msg),
    ];

    const lhsNode = call as Node;
    const rhsNode = expected as Node | undefined;

    let lhs = await compileSide(ctx, lhsNode);

    // Bare assertion (no operator): the value must be a live boolean.
    if (operator === undefined) {
      if (lhs.kind !== "call" || lhs.cat !== "Bool") {
        throw new ErrorException(
          "assert requires an operator and expected value, e.g. `assert <call> >= <value>` (a bare assert needs a boolean call)",
        );
      }
      // assertTrue(isZero(x)) ≡ x EQ 0: drop the wrapper when we can.
      if (lhs.notOf) {
        return emit(judged(lhs.notOf, [constraint("Eq", 0n)]));
      }
      return emit(judged(lhs.param, [constraint("Eq", 1n)]));
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

    let rhs = await compileSide(ctx, rhsNode);
    let op = operator as string;

    // Put the live side on the left: `5 < $t::f()` ≡ `$t::f() > 5`.
    if (lhs.kind === "const" && rhs.kind === "call") {
      [lhs, rhs] = [rhs, lhs];
      op = MIRRORED[op];
    }

    if (lhs.kind === "const" && rhs.kind === "const") {
      throw new ErrorException(
        "nothing to assert on-chain — both sides are build-time constants",
      );
    }

    // ---- both sides live: nested comparison judged EQ 1 ----------------
    if (lhs.kind === "call" && rhs.kind === "call") {
      if (op === "~=") {
        throw new ErrorException(
          "~= needs a constant side — compare two live values with `@num!(@absdiff!(a b)) <= <delta>` instead",
        );
      }
      const fragment = operatorFragment(op, [
        "Eq",
        "Ne",
        "Gt",
        "Lt",
        "Ge",
        "Le",
      ]);
      const cmp = cmpCombine(ctx, fragment as never, lhs, rhs);
      if (cmp.kind !== "call") {
        throw new ErrorException(
          "nothing to assert on-chain — the comparison folded to a constant",
        );
      }
      return emit(judged(cmp.param, [constraint("Eq", 1n)]));
    }

    // ---- live side vs constant: constraint mapping ---------------------
    const live = lhs as Operand & { kind: "call" };
    const cnst = rhs as Operand & { kind: "const" };
    const category = live.cat;

    const fragment = operatorFragment(op, PLAIN_OPERATORS[category]);

    // Booleans fold != into EQ 0 / EQ 1 constraints.
    if (category === "Bool") {
      if (cnst.cat !== "Bool") {
        throw new ErrorException(
          "a boolean return must be compared against true or false",
        );
      }
      const want = (cnst.value === true) === (fragment === "Eq");
      // x isZero-wrapped: judge the inner value with the inverted bound.
      if (live.notOf) {
        return emit(judged(live.notOf, [constraint("Eq", want ? 0n : 1n)]));
      }
      return emit(judged(live.param, [constraint("Eq", want ? 1n : 0n)]));
    }

    const isApprox = fragment === "ApproxEq";
    let delta: bigint | undefined;
    if (isApprox) {
      if (opts.delta === undefined) {
        throw new ErrorException("the ~= operator requires a --delta value");
      }
      delta = (opts.delta as Num).toBigInt();
    }

    // Dynamic values (string/bytes envelopes) judge via keccak of their
    // raw returndata against the digest of the constant's own envelope.
    if (category === "String" || category === "Bytes") {
      let digest: `0x${string}`;
      if (category === "String") {
        if (cnst.cat !== "String") {
          throw new ErrorException(
            "a string return must be compared against a string",
          );
        }
        digest = stringEnvelopeDigest(cnst.value as string);
      } else {
        if (
          (cnst.cat !== "Bytes" && cnst.cat !== "Bytes32") ||
          typeof cnst.value !== "string" ||
          !isHex(cnst.value)
        ) {
          throw new ErrorException(
            "a bytes return must be compared against a hex value",
          );
        }
        digest = keccak256(
          encodeAbiParameters([{ type: "bytes" }], [cnst.value]),
        );
      }
      // data(Hash) — keccak of the operand's raw resolved bytes.
      const hashed = staticCallParam(
        ctx.combinators,
        encodeData("Hash", live.param),
      );
      if (fragment === "Eq") {
        return emit(judged(hashed, [constraint("Eq", digest)]));
      }
      return emit(calcJudge(ctx.combinators, "Ne", hashed, BigInt(digest)));
    }

    // Word categories.
    let expectedWord: bigint;
    switch (category) {
      case "Uint": {
        const num = requireNum(cnst, "the expected value");
        if (num.lt(Num(0n))) {
          throw new ErrorException(
            "cannot compare an unsigned return against a negative value — cast the return as int256 with an inline ABI, e.g. ::{method()(int256)}",
          );
        }
        expectedWord = num.toBigInt();
        break;
      }
      case "Int":
        expectedWord = requireNum(cnst, "the expected value").toBigInt();
        break;
      case "Address": {
        if (cnst.cat !== "Address") {
          throw new ErrorException(
            "an address return must be compared against an address",
          );
        }
        expectedWord = BigInt(cnst.value as string);
        break;
      }
      case "Bytes32": {
        if (cnst.cat !== "Bytes32") {
          throw new ErrorException(
            "a bytes32 return must be compared against a 32-byte hex value",
          );
        }
        expectedWord = BigInt(cnst.value as string);
        break;
      }
      default:
        throw new ErrorException(`unsupported category ${category}`);
    }

    return emit(
      wordJudge(ctx.combinators, live.param, fragment, expectedWord, {
        signed: category === "Int",
        delta,
      }),
    );
  },
});

/** Compile one side of the assertion. */
async function compileSide(ctx: CompilerCtx, node: Node): Promise<Operand> {
  if (node.type === NodeType.CallExpression) {
    return compileTopCall(ctx, node as CallExpressionNode);
  }
  if (isBangHelperNode(node)) {
    return compileBangHelper(ctx, node);
  }
  return compileOperand(ctx, node);
}
