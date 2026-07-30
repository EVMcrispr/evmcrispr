import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type Zk from "..";
import { parseFieldArray, parseFieldInput } from "../utils/field";
import { loadPoseidon2 } from "../utils/poseidon";
import { buildTreeMode, fixedVerify, leanVerify } from "../utils/tree";

export default defineHelper<Zk>({
  name: "tree.verify",
  description:
    "Verify a Poseidon Merkle inclusion proof against a root, using the path index and siblings produced by @zk:tree.proof.",
  returnType: "bool",
  args: [
    { name: "root", type: "number", description: "Merkle root" },
    { name: "leaf", type: "number", description: "Leaf to prove" },
    {
      name: "index",
      type: "number",
      description:
        "Path index from @zk:tree.proof (equals the leaf index for fixed-depth and complete lean trees)",
    },
    {
      name: "proof",
      type: "array",
      description: "Array of sibling field elements, leaf to root",
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
  async run(_, { root, leaf, index, proof, lean, depth }) {
    const treeMode = buildTreeMode({ lean, depth });
    const rootValue = parseFieldInput(root, "root");
    const leafValue = parseFieldInput(leaf, "leaf");
    const pathIndex = Number(Num(index).toBigInt());
    const siblings =
      Array.isArray(proof) && proof.length === 0
        ? []
        : parseFieldArray(proof, "proof");
    if (treeMode.kind === "fixed" && siblings.length !== treeMode.depth) {
      throw new ErrorException(
        `<proof> must have exactly ${treeMode.depth} siblings for a depth-${treeMode.depth} tree, got ${siblings.length}`,
      );
    }
    const h = await loadPoseidon2();
    const valid =
      treeMode.kind === "lean"
        ? leanVerify(rootValue, leafValue, pathIndex, siblings, h)
        : fixedVerify(rootValue, leafValue, pathIndex, siblings, h);
    return valid ? "true" : "false";
  },
});
