import { defineHelper, Num } from "@evmcrispr/sdk";
import type Crypto from "..";
import { merkleProof, parseLeaves, parseMode } from "../utils/merkle";

export default defineHelper<Crypto>({
  name: "merkle.proof",
  description:
    "Generate the Merkle inclusion proof (array of sibling hashes) for the leaf at the given index. A single-leaf tree has an empty proof.",
  returnType: "array",
  args: [
    {
      name: "leaves",
      type: "array",
      description: "Array of bytes32 leaves, in tree order",
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
        "Pair hashing mode: sorted (default, OpenZeppelin MerkleProof convention) or unsorted (positional, e.g. Hop transfer roots)",
    },
  ],
  async run(_, { leaves, index, mode }) {
    return merkleProof(
      parseLeaves(leaves),
      Number(Num(index).toBigInt()),
      parseMode(mode),
    );
  },
});
