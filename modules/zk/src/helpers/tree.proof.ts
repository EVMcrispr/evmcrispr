import { defineHelper, fieldItem, Num } from "@evmcrispr/sdk";
import type Zk from "..";
import { parseFieldArray } from "../utils/field";
import { loadPoseidon2 } from "../utils/poseidon";
import { fixedProof, leanProof, parseTreeMode } from "../utils/tree";

export default defineHelper<Zk>({
  name: "tree.proof",
  description:
    "Generate the Poseidon Merkle inclusion proof for the leaf at the given index, as a `[pathIndex siblings]` pair ready for destructuring. Fixed-depth proofs always have exactly `depth` siblings; lean proofs skip levels without one and compress the path index accordingly.",
  returnType: "array",
  args: [
    {
      name: "leaves",
      type: "array",
      description: "Array of field-element leaves, in insertion order",
    },
    {
      name: "index",
      type: "number",
      description: "Zero-based position of the leaf to prove",
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
  async run(_, { leaves, index, mode }) {
    const treeMode = parseTreeMode(mode);
    const elements = parseFieldArray(leaves, "leaves");
    const leafIndex = Number(Num(index).toBigInt());
    const h = await loadPoseidon2();
    const { pathIndex, siblings } =
      treeMode.kind === "lean"
        ? leanProof(elements, leafIndex, h)
        : {
            pathIndex: leafIndex,
            siblings: fixedProof(elements, leafIndex, treeMode.depth, h),
          };
    return [Num.fromBigInt(BigInt(pathIndex)), siblings.map(Num.fromBigInt)];
  },
});
