import { defineHelper, fieldItem, Num } from "@evmcrispr/sdk";
import type Zk from "..";
import { parseFieldArray } from "../utils/field";
import { loadPoseidon2 } from "../utils/poseidon";
import { fixedRoot, leanRoot, parseTreeMode } from "../utils/tree";

export default defineHelper<Zk>({
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
      name: "mode",
      type: "string",
      optional: true,
      description:
        "Tree mode: `lean` (default, Semaphore v4 LeanIMT) or `depth:<n>` for a zero-padded fixed-depth tree",
    },
  ],
  completions: {
    mode: () => ["lean", "depth:20"].map(fieldItem),
  },
  async run(_, { leaves, mode }) {
    const treeMode = parseTreeMode(mode);
    const elements = parseFieldArray(leaves, "leaves");
    const h = await loadPoseidon2();
    const root =
      treeMode.kind === "lean"
        ? leanRoot(elements, h)
        : fixedRoot(elements, treeMode.depth, h);
    return Num.fromBigInt(root);
  },
});
