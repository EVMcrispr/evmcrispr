/**
 * The `assert` command's compiler as a library: what the std command
 * calls, and what an editor or a builder calls to get the SAME
 * compilation the command emits, with the compiled operands beside the
 * calldata. One authority for what an assertion means: the categories,
 * the mirroring, the constraint mapping and the rounding all live here.
 */
import { isHex, keccak256 } from "viem";
import { CompileError, ErrorException, NodeError } from "../errors";
import type { Module } from "../Module";
import type {
  Action,
  CallExpressionNode,
  Node,
  NodesInterpreters,
  TransactionAction,
} from "../types";
import { isTransactionAction, NodeType } from "../types";
import { Num } from "../utils/Num";
import {
  COLLECTIONS_ADDRESS,
  CORE_ADDRESS,
  EXPRESSIONS_ADDRESS,
  OPERATIONS_ADDRESS,
} from "./addresses";
import {
  boundWord,
  checkParamAction,
  operatorFragment,
  wholeDelta,
} from "./assert";
import {
  cmpCombine,
  compileOperand,
  compileTopCall,
  hashParamOf,
  scaleOf,
  stringDigest,
} from "./compile";
import { compileOnchainHelper, isBangHelperNode } from "./dispatch";
import { constraint, type InputParam } from "./erc8211";
import { judged, opJudge, wordJudge } from "./judge";
import type { Category, CompileCtx, CompileHints, Operand } from "./types";

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

/** The hint every malformed `assert` line ends with. */
export const ASSERT_WRAP_HINT =
  'assert takes `<value> <op> <value> ["message"]`: wrap arithmetic in @calc!(…) and boolean logic in @bool!(…)';

/** What an `assert` line says, as parsed nodes: the interpreter has
 *  already split the arguments and the `--delta` option. */
export interface AssertionSpec {
  /** The subject expression (a `::` call, an on-chain helper, or a
   *  constant that mirrors to the right). */
  call: Node;
  /** One of `==`, `!=`, `>`, `<`, `>=`, `<=`, `~=`; absent for a bare
   *  boolean assertion. */
  operator?: string;
  expected?: Node;
  /** Revert message when the assertion fails. */
  message?: string;
  /** Allowed delta for `~=`, in the subject's own units. */
  delta?: Num;
}

/** Everything a compiled assertion knows, beside the calldata. */
export interface AssertionCompilation {
  /** The live side, after mirroring puts it on the left. */
  subject: Operand & { kind: "call" };
  /** The other side, mirrored with the subject; absent for a bare
   *  boolean assertion. */
  expected?: Operand;
  /** The operator between `subject` and `expected`, mirrored with them. */
  operator?: string;
  /** The constraint fragment the operator lowered to (Eq, Ne, Gt, Lt,
   *  Ge, Le, ApproxEq). */
  fragment?: string;
  /** The judged param `checkParam` receives. */
  param: InputParam;
  message: string;
  /** False when a face can only resolve inside a transaction (see
   *  `CompileHints.transact`). */
  readOnly: boolean;
  hints: CompileHints;
}

/** The context an emitting command compiles under: the canonical
 *  addresses and a fresh hints bag. */
export function defaultCompileCtx(
  module: Module,
  interpreters: NodesInterpreters,
): CompileCtx {
  return {
    module,
    interpreters,
    core: CORE_ADDRESS,
    operators: OPERATIONS_ADDRESS,
    collections: COLLECTIONS_ADDRESS,
    expressions: EXPRESSIONS_ADDRESS,
    hints: {},
  };
}

/**
 * Compile one side of an assertion. A `::` call is compiled as a top
 * call (so a lens may select a string/bytes value), a `!` helper through
 * the cross-module dispatch, anything else as a plain operand. A failure
 * that carries no location is rethrown as a {@link CompileError} spanning
 * this side's node, so the message points at the expression that broke.
 */
export async function compileAssertionSide(
  ctx: CompileCtx,
  node: Node,
): Promise<Operand> {
  try {
    if (node.type === NodeType.CallExpression) {
      return await compileTopCall(ctx, node as CallExpressionNode);
    }
    if (isBangHelperNode(node)) {
      return await compileOnchainHelper(ctx, node);
    }
    return await compileOperand(ctx, node);
  } catch (err) {
    if (err instanceof NodeError) throw err;
    if (err instanceof ErrorException)
      throw new CompileError(node, err.message);
    throw err;
  }
}

function requireNum(o: Operand & { kind: "const" }, what: string): Num {
  const v = o.value;
  if (v instanceof Num) return v;
  throw new ErrorException(`${what} must be a number, got a ${o.cat} value`);
}

/**
 * Compile an assertion to its judged param. The subject is always the live
 * side: `5 < $t::f()` mirrors to `$t::f() > 5`. Booleans fold `!=` into
 * EQ 0/1 constraints, strings and bytes judge the keccak of their decoded
 * payload, word categories go through the constraint mapping, and two
 * live sides compare through an Operations call judged `EQ 1`.
 */
export async function compileAssertion(
  ctx: CompileCtx,
  spec: AssertionSpec,
): Promise<AssertionCompilation> {
  // Faces write into the hints bag; a context that came without one gets
  // a fresh bag on a copy, so the caller's context stays untouched.
  const hints: CompileHints = ctx.hints ?? {};
  if (!ctx.hints) ctx = { ...ctx, hints };
  const message = spec.message ?? "";
  const done = (
    param: InputParam,
    rest: Pick<
      AssertionCompilation,
      "subject" | "expected" | "operator" | "fragment"
    >,
  ): AssertionCompilation => ({
    ...rest,
    param,
    message,
    readOnly: !hints.transact,
    hints,
  });

  let lhs = await compileAssertionSide(ctx, spec.call);

  // Bare assertion (no operator): the value must be a live boolean.
  if (spec.operator === undefined) {
    if (lhs.kind !== "call" || lhs.cat !== "Bool") {
      throw new ErrorException(
        "assert requires an operator and expected value, e.g. `assert <call> >= <value>` (a bare assert needs a boolean call)",
      );
    }
    const bare = { subject: lhs };
    // assertTrue(eq(x, 0)) ≡ x EQ 0: drop the wrapper when we can.
    if (lhs.notOf) {
      return done(judged(lhs.notOf, [constraint("Eq", 0n)]), bare);
    }
    // assertTrue(isValid(x)) ≡ x resolving: judge a zero-constraint
    // entry on the raw operand, so a failure reports the resolution's
    // own error (e.g. UnexpectedRevertData) instead of ConstraintFailed.
    if (lhs.validOf) {
      return done(judged(lhs.validOf, []), bare);
    }
    return done(judged(lhs.param, [constraint("Eq", 1n)]), bare);
  }

  if (!(spec.operator in MIRRORED)) {
    throw new ErrorException(
      `unknown comparison operator "${spec.operator}". Use one of ${Object.keys(MIRRORED).join(", ")}. ${ASSERT_WRAP_HINT}`,
    );
  }
  if (!spec.expected) {
    throw new ErrorException(
      `operator "${spec.operator}" requires an expected value`,
    );
  }

  let rhs = await compileAssertionSide(ctx, spec.expected);
  let op = spec.operator;

  // Put the live side on the left: `5 < $t::f()` ≡ `$t::f() > 5`.
  if (lhs.kind === "const" && rhs.kind === "call") {
    [lhs, rhs] = [rhs, lhs];
    op = MIRRORED[op];
  }

  if (lhs.kind === "const" && rhs.kind === "const") {
    throw new ErrorException(
      "nothing to assert on-chain: both sides are build-time constants",
    );
  }

  // ---- both sides live: nested comparison judged EQ 1 ----------------
  if (lhs.kind === "call" && rhs.kind === "call") {
    if (op === "~=") {
      throw new ErrorException(
        "~= needs a constant side: compare two live values with `@calc!(@absDiff!(a b)) <= <delta>` instead",
      );
    }
    const fragment = operatorFragment(op, ["Eq", "Ne", "Gt", "Lt", "Ge", "Le"]);
    const cmp = cmpCombine(ctx, fragment as never, lhs, rhs);
    if (cmp.kind !== "call") {
      throw new ErrorException(
        "nothing to assert on-chain: the comparison folded to a constant",
      );
    }
    return done(judged(cmp.param, [constraint("Eq", 1n)]), {
      subject: lhs,
      expected: rhs,
      operator: op,
      fragment,
    });
  }

  // ---- live side vs constant: constraint mapping ---------------------
  const live = lhs as Operand & { kind: "call" };
  const cnst = rhs as Operand & { kind: "const" };
  const category = live.cat;

  const fragment = operatorFragment(op, PLAIN_OPERATORS[category]);
  const sides = { subject: live, expected: cnst, operator: op, fragment };

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
      return done(
        judged(live.notOf, [constraint("Eq", want ? 0n : 1n)]),
        sides,
      );
    }
    // isValid(x) == true ≡ x resolving: same zero-constraint fold as the
    // bare form. Expecting false keeps the word comparison, since "does
    // not resolve" has no raw-entry spelling.
    if (live.validOf && want) {
      return done(judged(live.validOf, []), sides);
    }
    return done(judged(live.param, [constraint("Eq", want ? 1n : 0n)]), sides);
  }

  const isApprox = fragment === "ApproxEq";
  let delta: bigint | undefined;
  if (isApprox) {
    if (spec.delta === undefined) {
      throw new ErrorException("the ~= operator requires a --delta value");
    }
    delta = wholeDelta(upscale(spec.delta), spec.delta);
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
      return done(judged(hashed, [constraint("Eq", digest)]), sides);
    }
    return done(opJudge(ctx, "ne", false, hashed, BigInt(digest)), sides);
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
          "cannot compare an unsigned return against a negative value: cast the return as int256 with an inline ABI, e.g. ::{method()(int256)}",
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

  return done(
    wordJudge(ctx, live.param, fragment, expectedWord, {
      signed: category === "Int",
      delta,
    }),
    sides,
  );
}

/** The action `assert` emits: an `checkParam` call against the core,
 *  carrying its compilation beside the calldata. Downstream serialisers
 *  pick the transaction fields explicitly, so the extra property is
 *  inert on the wire. */
export interface AssertionAction extends TransactionAction {
  compiled: AssertionCompilation;
}

/** Wrap a compilation as the action `assert` returns. */
export function assertionAction(c: AssertionCompilation): AssertionAction {
  return {
    ...checkParamAction(c.param, c.message),
    readOnly: c.readOnly,
    compiled: c,
  };
}

/** Whether an action came out of {@link assertionAction}. */
export function isAssertionAction(a: Action): a is AssertionAction {
  if (!isTransactionAction(a) || !("compiled" in a)) return false;
  const c = (a as { compiled?: unknown }).compiled;
  return typeof c === "object" && c !== null && "param" in c && "subject" in c;
}
