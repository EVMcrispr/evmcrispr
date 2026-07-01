import { defineHelper } from "@evmcrispr/sdk";
import { keccak256 } from "viem";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "codehash",
  description: "Read the keccak256 code hash of an address.",
  returnType: "bytes32",
  args: [{ name: "address", type: "address", description: "Address to read" }],
  async run(module, { address }) {
    const client = await module.getClient();
    const code = await client.getCode({ address });
    return keccak256(code ?? "0x");
  },
});
