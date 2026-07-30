import { defineHelper, Num } from "@evmcrispr/sdk";
import type Circom from "..";
import { parseFieldArray } from "../utils/field";
import { loadPoseidon2 } from "../utils/poseidon";
import { buildTreeMode, fixedRoot, leanRoot } from "../utils/tree";

export default defineHelper<Circom>({
  name: "tree.root",
  description:
    "Compute the Poseidon Merkle root of an array of field-element leaves. A single-leaf lean tree has root = leaf.",
  returnType: "number",
  args: [
    {
      name: "leaves",
      type: "array",
      description: "Array of field-element leaves, in insertion order",
    },
    {
      name: "lean",
      type: "bool",
      namedOnly: true,
      description:
        "`lean:true` — Semaphore v4 LeanIMT (the default when depth: is not set)",
    },
    {
      name: "depth",
      type: "number",
      namedOnly: true,
      description: "`depth:<n>` — zero-padded fixed-depth tree",
    },
  ],
  async run(_, { leaves, lean, depth }) {
    const treeMode = buildTreeMode({ lean, depth });
    const elements = parseFieldArray(leaves, "leaves");
    const h = await loadPoseidon2();
    const root =
      treeMode.kind === "lean"
        ? leanRoot(elements, h)
        : fixedRoot(elements, treeMode.depth, h);
    return Num.fromBigInt(root);
  },
});
