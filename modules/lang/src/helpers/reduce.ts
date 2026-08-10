import type { HelperFunctionNode } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import {
  categoryFromAbiType,
  constIntArg,
  FOLD_EXIT,
  foldParam,
  opSelector,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

/**
 * Binary Operators lambdas a fold accumulator composes with.
 *
 * The template is a left fold, `f(<accumulator at 4>, <element at 36>)`,
 * so a reducer earns a place here only if it is COMMUTATIVE and
 * ASSOCIATIVE over 256-bit words. Then neither the argument order nor the
 * bracketing can change the answer, and the window convention stays
 * invisible to the script.
 *
 * That is why the non-commutative ops stay out. `sub`, `div`, `mod`,
 * `exp`, `shl` and `shr` would all encode fine — `foldParam` takes the
 * two window offsets independently, so `(36n, 4n)` even gives the flipped
 * order for free — but `@reduce!(caps sub 1000)` computes
 * `((1000 - c0) - c1) …` while half of readers will picture `c - acc`,
 * and the two differ silently in the value rather than loudly in a
 * revert. They can come back once the language can say which side the
 * accumulator sits on.
 *
 * `absDiff` is commutative but not associative, so a left fold over it is
 * a distance chain with no statable meaning.
 */
const REDUCERS = [
  "add",
  "mul",
  "min",
  "max",
  "bitAnd",
  "bitOr",
  "bitXor",
] as const;

/** Reducers whose signed overload exists (the intersection of REDUCERS
 *  with SIGNED_OVERLOADS). The bitwise three are word operations with no
 *  signed reading, so they stay unsigned over an `int256[]` too. */
const SIGNED_REDUCERS = new Set(["add", "mul", "min", "max"]);

/** Comparisons are binary `(uint256,uint256)` Operators functions too, so
 *  they would encode — but folding a comparison IS `@all!`/`@any!`, which
 *  already exist with the right exit modes. Named so the error can say so
 *  instead of listing the whole vocabulary. */
const COMPARISONS = new Set(["eq", "ne", "lt", "gt", "le", "ge", "bitSet"]);

const UINT_MAX = 2n ** 256n - 1n;
const INT_MIN = -(2n ** 255n);
const INT_MAX = 2n ** 255n - 1n;

/**
 * The initial accumulator that makes a reducer collapse: fold anything
 * with it and the answer is still it. A non-absorbing initial value is a
 * legitimate clamp (`min 500` is "the smallest cap, but no more than
 * 500"), so only the absorbing one is worth rejecting.
 *
 * It depends on the overload, which is why this is a function of `signed`
 * rather than a table. Nothing is below 0 in unsigned order, so
 * `min 0` collapses — but in signed order 0 is an ordinary clamp and only
 * the most negative word absorbs.
 */
function absorbingInit(
  name: string,
  signed: boolean,
): { word: bigint; identity: string } | undefined {
  switch (name) {
    case "mul":
      return { word: 0n, identity: "1" };
    case "bitAnd":
      return { word: 0n, identity: "a word of all ones" };
    case "bitOr":
      return { word: UINT_MAX, identity: "0" };
    case "min":
      return signed
        ? { word: INT_MIN, identity: "the largest signed word" }
        : { word: 0n, identity: "the largest word" };
    case "max":
      return signed
        ? { word: INT_MAX, identity: "the smallest signed word" }
        : { word: UINT_MAX, identity: "0" };
    default:
      // add and bitXor have no absorbing element.
      return undefined;
  }
}

export default defineHelper<Lang>({
  name: "reduce",
  description: "Reduce an array to a single value by applying a helper.",
  compileDescription:
    "The reducer is one of `add`, `mul`, `min`, `max`, `bitAnd`, `bitOr` or `bitXor`, and the initial accumulator a build-time value.",
  returnType: "any",
  args: [
    {
      name: "arr",
      type: "array",
      description: "Source array",
    },
    {
      name: "fn",
      type: "helper",
      description: "Reducer helper receiving `(accumulator, element)`",
    },
    { name: "initial", type: "any", description: "Initial accumulator value" },
  ],
  async run(_, { arr, fn, initial }) {
    let acc = initial;
    for (const item of arr) {
      acc = await fn(acc, item);
    }
    return acc;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 3) {
      throw new ErrorException(
        "@reduce! expects (call fn initial), e.g. @reduce!($vault::caps() add 0)",
      );
    }
    const { payload, elemType } = await wordsArg(ctx, node.args[0], "reduce!");

    const fnNode = node.args[1];
    let name: string | undefined;
    if (fnNode.type === NodeType.HelperFunctionExpression) {
      name = (fnNode as HelperFunctionNode).name.replace(/!$/, "");
    } else {
      const value = await ctx.interpreters.interpretNode(fnNode);
      if (typeof value === "string") name = value;
    }
    if (name && COMPARISONS.has(name)) {
      throw new ErrorException(
        `@reduce! folds values, not comparisons — folding \`${name}\` over the elements is what @all! and @any! already do, with the exit that stops early`,
      );
    }
    if (!name || !(REDUCERS as readonly string[]).includes(name)) {
      throw new ErrorException(
        `@reduce! reduces with a binary Operators lambda — one of ${REDUCERS.join(", ")} — got ${name ?? "an unsupported reducer"}. Order-sensitive operations are excluded on purpose: the accumulator is always the LEFT argument, so a wrong guess about the side would change the value silently`,
      );
    }
    const init = await constIntArg(ctx, "reduce!", "initial", node.args[2]);
    // The elements' own signedness picks the overload. Without it `min`
    // over an int256[] would read two's-complement negatives as huge
    // positives and return the wrong element. The bitwise reducers have
    // no signed reading, so they stay on the uint256 overload either way.
    const elemCat = categoryFromAbiType(elemType);
    const signed = elemCat === "Int" && SIGNED_REDUCERS.has(name);
    const absorbing = absorbingInit(name, signed);
    // Compared as WORDS, so `-1` and `2^256 - 1` are recognised as the
    // same accumulator rather than two spellings that behave alike.
    if (absorbing && toWord(init) === toWord(absorbing.word)) {
      throw new ErrorException(
        `@reduce! with \`${name}\` and that initial accumulator always yields the accumulator itself — the identity for \`${name}\` over these elements is ${absorbing.identity}`,
      );
    }
    // <fn>(<accumulator>, <element>): accumulator window at 4, element
    // window at 36 — the canonical foldWords convention.
    const template: Hex = `0x${opSelector(name, signed).slice(2)}${toWord(0n).slice(2)}${toWord(0n).slice(2)}`;
    return {
      kind: "call",
      param: foldParam(
        ctx,
        "foldWords",
        payload,
        template,
        4n,
        36n,
        init,
        FOLD_EXIT.Full,
      ),
      cat: signed ? "Int" : "Uint",
    };
  },
});
