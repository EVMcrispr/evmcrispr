import { defineHelper } from "@evmcrispr/sdk";
import type Crypto from "..";
import { merkleRoot, parseLeaves, parseMode } from "../utils/merkle";

export default defineHelper<Crypto>({
  name: "merkle.root",
  description:
    "Compute the Merkle root of an array of bytes32 leaves. A single-leaf tree has root = leaf.",
  returnType: "bytes32",
  args: [
    {
      name: "leaves",
      type: "array",
      description: "Array of bytes32 leaves, in tree order",
    },
    {
      name: "mode",
      type: "string",
      optional: true,
      description:
        "Pair hashing mode: sorted (default, OpenZeppelin MerkleProof convention) or unsorted (positional, e.g. Hop transfer roots)",
    },
  ],
  async run(_, { leaves, mode }) {
    return merkleRoot(parseLeaves(leaves), parseMode(mode));
  },
});
