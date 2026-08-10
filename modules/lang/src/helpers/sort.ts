import {
  defineHelper,
  ErrorException,
  NodeType,
  Num,
  naturalCompare,
} from "@evmcrispr/sdk";
import {
  categoryFromAbiType,
  mapWordsParam,
  OP_SELECTORS,
  opReadParam,
  opSelector,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

async function asyncMergeSort(
  arr: any[],
  cmp: (a: any, b: any) => Promise<any>,
): Promise<any[]> {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  const [left, right] = await Promise.all([
    asyncMergeSort(arr.slice(0, mid), cmp),
    asyncMergeSort(arr.slice(mid), cmp),
  ]);
  return asyncMerge(left, right, cmp);
}

async function asyncMerge(
  left: any[],
  right: any[],
  cmp: (a: any, b: any) => Promise<any>,
): Promise<any[]> {
  const result: any[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const c = await cmp(left[i], right[j]);
    const n = c instanceof Num ? c.toNumber() : Number(c);
    if (n <= 0) {
      result.push(left[i++]);
    } else {
      result.push(right[j++]);
    }
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}

/** Natural order, used when no comparator is given: numbers compare
 *  numerically, everything else by its string form.
 *
 *  Goes through `naturalCompare` rather than testing `instanceof Num`, which
 *  would miss the raw `bigint` a `uint256[]` read arrives as and sort those
 *  numbers as strings. */
async function naturalOrder(a: unknown, b: unknown): Promise<number> {
  return naturalCompare(a, b);
}

/** The sign bit. Flipping it maps signed order onto unsigned order
 *  exactly, and unlike adding 2^255 it cannot overflow a checked add. */
const SIGN_BIT = 1n << 255n;

function isDirection(v: unknown): v is "asc" | "desc" {
  return v === "asc" || v === "desc";
}

export default defineHelper<Lang>({
  name: "sort",
  description:
    "Sort an array: ascending by default, `desc` for descending, or by a comparator helper.",
  compileDescription:
    "Takes a direction rather than a comparator, and signed elements sort by value: the sign bit is flipped on the way in and back on the way out.",
  returnType: "array",
  args: [
    { name: "arr", type: "array", description: "Source array" },
    {
      name: "order",
      type: ["helper", "string"],
      optional: true,
      description:
        "`asc` (default) or `desc`, or a comparator helper returning a number",
    },
  ],
  async run(_, { arr, order }) {
    if (arr.length > 10_000) {
      throw new ErrorException("@sort: maximum array length is 10,000");
    }
    if (
      order !== undefined &&
      !isDirection(order) &&
      typeof order !== "function"
    ) {
      throw new ErrorException(
        `@sort order must be \`asc\`, \`desc\`, or a comparator helper — got ${String(order)}`,
      );
    }
    const cmp = typeof order === "function" ? order : naturalOrder;
    const sorted = await asyncMergeSort([...arr], cmp);
    return order === "desc" ? sorted.reverse() : sorted;
  },
  compile: async (ctx, node) => {
    if (node.args.length > 2) {
      throw new ErrorException(
        "@sort! expects (call order?), e.g. @sort!($safe::getOwners() desc)",
      );
    }
    const { payload, elemType } = await wordsArg(ctx, node.args[0], "sort!");

    let order: "asc" | "desc" = "asc";
    if (node.args[1]) {
      // Check the SHAPE before interpreting: a bare `@cmp` reference would
      // otherwise be called with no arguments, and the user would see the
      // comparator's own arity error instead of the real problem.
      const value =
        node.args[1].type === NodeType.HelperFunctionExpression
          ? undefined
          : await ctx.interpreters.interpretNode(node.args[1]);
      if (!isDirection(value)) {
        throw new ErrorException(
          `@sort! orders by direction, not by a comparator — pass \`asc\` or \`desc\`, got ${node.args[1].type === NodeType.HelperFunctionExpression ? `@${(node.args[1] as { name: string }).name}` : String(value)}. A word sort has no comparator hook on-chain`,
        );
      }
      order = value;
    }

    // Signed elements sort by their raw word otherwise, which puts every
    // negative after every positive. Flipping the sign bit maps signed
    // order onto unsigned order exactly, so the fix is to flip on the way
    // in and back on the way out: two extra passes, one call per element
    // each, which is why it is only done when the elements are signed.
    const signed = categoryFromAbiType(elemType) === "Int";
    const flip = (words: typeof payload) => {
      const template: Hex = `0x${opSelector("bitXor").slice(2)}${toWord(0n).slice(2)}${toWord(SIGN_BIT).slice(2)}`;
      return mapWordsParam(ctx, words, ctx.operators, template, [4n]);
    };

    let out = opReadParam(ctx, OP_SELECTORS.sortWords, [
      signed ? flip(payload) : payload,
    ]);
    if (signed) out = flip(out);
    if (order === "desc") {
      out = opReadParam(ctx, OP_SELECTORS.reverseWords, [out]);
    }
    return { kind: "call", param: out, cat: "Bytes" };
  },
});
