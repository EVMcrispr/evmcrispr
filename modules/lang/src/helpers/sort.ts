import { ErrorException, Num, defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

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
  description: "Sort an array using a comparator helper.",
  returnType: "array",
  args: [
    { name: "arr", type: "array", description: "Source array" },
    { name: "fn", type: "helper", description: "Comparator helper returning a number" },
  ],
  async run(_, { arr, fn }) {
    if (arr.length > 10_000) {
      throw new ErrorException("@sort: maximum array length is 10,000");
    }
    return asyncMergeSort([...arr], fn);
  },
});
