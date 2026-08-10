import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  compileOperand,
  constIntArg,
  FOLD_EXIT,
  foldParam,
  materializeWord,
  OP_SELECTORS,
  toWord,
  wordOpParam,
  wordsArg,
} from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
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
    "Verify a Merkle inclusion proof against a root: with no index the sorted-pair convention (OpenZeppelin MerkleProof), with an index the positional one for unsorted trees.",
  compileDescription:
    "Sorted-pair trees only: the positional (indexed) form has no on-chain face.",
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
  compile: async (ctx, node) => {
    if (node.args.length !== 3) {
      if (node.args.length === 4) {
        throw new ErrorException(
          "@merkle.verify! verifies sorted-pair (OpenZeppelin) trees on-chain — positional (indexed) verification stays off-chain",
        );
      }
      throw new ErrorException(
        "@merkle.verify! expects (root leaf proof), e.g. @merkle.verify!($root 0xleaf… $dist::proofOf(@me))",
      );
    }
    const root = await compileOperand(ctx, node.args[0]);
    if (root.kind === "call" && root.cat !== "Bytes32") {
      throw new ErrorException(
        `@merkle.verify! root must be a bytes32 value, got ${root.cat}`,
      );
    }
    const leaf = await constIntArg(ctx, "merkle.verify!", "leaf", node.args[1]);
    const { payload } = await wordsArg(ctx, node.args[2], "merkle.verify!");
    // hashPairSorted(<accumulator>, <sibling>) folded from the leaf over
    // the whole proof — the canonical 4/36 windows, Full exit — then the
    // reproduced root compares against the expected one.
    const template: Hex = `0x${OP_SELECTORS.hashPairSorted.slice(2)}${toWord(0n).slice(2)}${toWord(0n).slice(2)}`;
    const fold = foldParam(
      ctx,
      "foldWords",
      payload,
      ctx.operators,
      template,
      4n,
      [36n],
      leaf,
      FOLD_EXIT.Full,
    );
    return {
      kind: "call",
      param: wordOpParam(ctx, "eq", false, fold, materializeWord(ctx, root)),
      cat: "Bool",
    };
  },
});
