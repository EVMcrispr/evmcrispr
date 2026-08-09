import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { OP_SELECTORS, opReadParam } from "@evmcrispr/sdk/onchain";
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

export default defineHelper<Lang>({
  name: "sort",
  description:
    "Sort an array using a comparator helper. As @sort! the array return of a call sorted on-chain through sortWords: UNSIGNED ascending word order, no comparator (see the docs for the signed recipe via @map!).",
  returnType: "array",
  args: [
    { name: "arr", type: "array", description: "Source array" },
    {
      name: "fn",
      type: "helper",
      description: "Comparator helper returning a number",
    },
  ],
  async run(_, { arr, fn }) {
    if (arr.length > 10_000) {
      throw new ErrorException("@sort: maximum array length is 10,000");
    }
    return asyncMergeSort([...arr], fn);
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@sort! sorts in unsigned ascending word order and takes no comparator — @sort!($safe::getOwners())",
      );
    }
    const { payload } = await wordsArg(ctx, node.args[0], "sort!");
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.sortWords, [payload]),
      cat: "Bytes",
    };
  },
});
