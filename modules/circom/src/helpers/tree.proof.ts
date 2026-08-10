import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type Circom from "..";
import { parseFieldArray } from "../utils/field";
import { loadPoseidon2 } from "../utils/poseidon";
import { buildTreeProofOptions, fixedProof, leanProof } from "../utils/tree";

export default defineHelper<Circom>({
  name: "tree.proof",
  description:
    "Generate the Poseidon Merkle inclusion proof for the leaf at the given index, as a `[pathIndex siblings]` pair ready for destructuring, or `[pathIndex siblings length]` with `pad:<n>`, which zero-pads lean siblings to the fixed length circuits expect. Fixed-depth proofs always have exactly `depth` siblings; lean proofs skip levels without one and compress the path index accordingly.",
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
    {
      name: "pad",
      type: "number",
      namedOnly: true,
      description:
        "`pad:<n>` — zero-pad lean siblings to a fixed length and append the real proof length",
    },
  ],
  async run(_, { leaves, index, lean, depth, pad: padArg }) {
    const { mode, pad } = buildTreeProofOptions({ lean, depth, pad: padArg });
    const elements = parseFieldArray(leaves, "leaves");
    const leafIndex = Number(Num(index).toBigInt());
    const h = await loadPoseidon2();
    const { pathIndex, siblings } =
      mode.kind === "lean"
        ? leanProof(elements, leafIndex, h)
        : {
            pathIndex: leafIndex,
            siblings: fixedProof(elements, leafIndex, mode.depth, h),
          };
    const pathIndexNum = Num.fromBigInt(BigInt(pathIndex));
    if (pad === undefined) {
      return [pathIndexNum, siblings.map(Num.fromBigInt)];
    }
    if (pad < siblings.length) {
      throw new ErrorException(
        `<options> pad:${pad} is smaller than the proof length ${siblings.length}`,
      );
    }
    const padded = [
      ...siblings,
      ...Array.from({ length: pad - siblings.length }, () => 0n),
    ];
    return [
      pathIndexNum,
      padded.map(Num.fromBigInt),
      Num.fromBigInt(BigInt(siblings.length)),
    ];
  },
});
