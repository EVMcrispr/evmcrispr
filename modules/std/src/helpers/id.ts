import { defineHelper } from "@evmcrispr/sdk";
import { keccak256, toHex } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "id",
  description:
    "Compute the keccak256 hash of a string (first 4 bytes for selectors).",
  returnType: "bytes32",
  args: [{ name: "text", type: "string" }],
  async run(_, { text }) {
    return keccak256(toHex(text));
  },
});
