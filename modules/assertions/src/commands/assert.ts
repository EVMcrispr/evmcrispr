import type { Action, CallExpressionNode, Node } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, NodeType, Num } from "@evmcrispr/sdk";
import type { Category, CompileCtx, Operand } from "@evmcrispr/sdk/onchain";
import {
  cmpCombine,
  compileOnchainHelper,
  compileOperand,
  compileTopCall,
  hashParamOf,
  isBangHelperNode,
  scaleOf,
  stringDigest,
} from "@evmcrispr/sdk/onchain";
import { isHex, keccak256 } from "viem";
import type Assertions from "..";
import {
  assertParamAction,
  boundWord,
  operatorFragment,
  resolveAssertionsContract,
  resolveOperatorsContract,
  wholeDelta,
} from "../lib/assertions";
import type { InputParam } from "../lib/erc8211";
import { constraint } from "../lib/erc8211";
import { judged, opJudge, wordJudge } from "../lib/judge";

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
    const ctx: CompileCtx = {
      module,
      interpreters,
      core: await resolveAssertionsContract(module),
      operators: await resolveOperatorsContract(module),
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
      // assertTrue(eq(x, 0)) ≡ x EQ 0: drop the wrapper when we can.
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
          "~= needs a constant side — compare two live values with `@num!(@absDiff!(a b)) <= <delta>` instead",
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

    // A scaled live value (a ray rate, a wad price) is compared in ITS
    // units, so both the bound and the tolerance move up to meet it:
    // against a ray read, 0.05 is the whole number 5e25 and the rounding
    // below never has to fire.
    const scale = scaleOf(live);
    const upscale = (n: Num): Num =>
      scale ? n.mul(Num(10n ** BigInt(scale))) : n;
    const asWord = (n: Num): bigint => boundWord(upscale(n), fragment, n);

    // Booleans fold != into EQ 0 / EQ 1 constraints.
    if (category === "Bool") {
      if (cnst.cat !== "Bool") {
        throw new ErrorException(
          "a boolean return must be compared against true or false",
        );
      }
      const want = (cnst.value === true) === (fragment === "Eq");
      // x not-wrapped (eq(x, 0)): judge the inner value with the inverted
      // bound.
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
      delta = wholeDelta(upscale(opts.delta as Num), opts.delta as Num);
    }

    // Dynamic values (string/bytes envelopes) judge via keccak of their
    // decoded payload against the digest of the constant's own bytes: the
    // resolved envelope is spliced into `hash(bytes)`, whose digest covers
    // the payload itself, not the ABI envelope.
    if (category === "String" || category === "Bytes") {
      let digest: `0x${string}`;
      if (category === "String") {
        if (cnst.cat !== "String") {
          throw new ErrorException(
            "a string return must be compared against a string",
          );
        }
        digest = stringDigest(cnst.value as string);
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
        digest = keccak256(cnst.value);
      }
      const hashed = hashParamOf(ctx, live.param);
      if (fragment === "Eq") {
        return emit(judged(hashed, [constraint("Eq", digest)]));
      }
      return emit(opJudge(ctx, "ne", false, hashed, BigInt(digest)));
    }

    // Word categories.
    let expectedWord: bigint;
    switch (category) {
      case "Uint": {
        // Round first: `x >= -0.5` is `x >= 0`, a perfectly good unsigned
        // bound, while `x <= -0.5` stays negative and is rejected below.
        expectedWord = asWord(requireNum(cnst, "the expected value"));
        if (expectedWord < 0n) {
          throw new ErrorException(
            "cannot compare an unsigned return against a negative value — cast the return as int256 with an inline ABI, e.g. ::{method()(int256)}",
          );
        }
        break;
      }
      case "Int":
        expectedWord = asWord(requireNum(cnst, "the expected value"));
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
      wordJudge(ctx, live.param, fragment, expectedWord, {
        signed: category === "Int",
        delta,
      }),
    );
  },
});

/** Compile one side of the assertion. */
async function compileSide(ctx: CompileCtx, node: Node): Promise<Operand> {
  if (node.type === NodeType.CallExpression) {
    return compileTopCall(ctx, node as CallExpressionNode);
  }
  if (isBangHelperNode(node)) {
    return compileOnchainHelper(ctx, node);
  }
  return compileOperand(ctx, node);
}
