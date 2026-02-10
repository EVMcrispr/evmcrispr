import { defineHelper } from "@evmcrispr/sdk";
import { keccak256, toHex } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "id",
  args: [{ name: "text", type: "string" }],
  async run(_, { text }) {
    return keccak256(toHex(text));
  },
});
