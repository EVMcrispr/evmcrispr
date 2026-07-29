import { defineHelper, Num } from "@evmcrispr/sdk";
import type Crypto from "..";
import {
  parseBytes32,
  parseProof,
  verifySorted,
  verifyUnsorted,
} from "../utils/merkle";

export default defineHelper<Crypto>({
  name: "merkle.verify",
  description:
    "Verify a Merkle inclusion proof against a root. Without an index the proof is checked with the sorted-pair convention (OpenZeppelin MerkleProof); with an index it is checked positionally (unsorted trees).",
  returnType: "bool",
  args: [
    { name: "root", type: "bytes32", description: "Merkle root" },
    { name: "leaf", type: "bytes32", description: "Leaf to prove" },
    {
      name: "proof",
      type: "array",
      description: "Array of bytes32 sibling hashes, leaf to root",
    },
    {
      name: "index",
      type: "number",
      optional: true,
      description:
        "Zero-based leaf position for positional (unsorted) verification; omit for sorted-pair trees",
    },
  ],
  async run(_, { root, leaf, proof, index }) {
    const rootHash = parseBytes32(root, "root");
    const leafHash = parseBytes32(leaf, "leaf");
    const siblings = parseProof(proof);
    const valid =
      index === undefined
        ? verifySorted(rootHash, leafHash, siblings)
        : verifyUnsorted(
            rootHash,
            leafHash,
            siblings,
            Number(Num(index).toBigInt()),
          );
    return valid ? "true" : "false";
  },
});
