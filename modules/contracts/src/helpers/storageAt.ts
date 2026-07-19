import { defineHelper } from "@evmcrispr/sdk";
import { pad } from "viem";
import type Contracts from "..";

export default defineHelper<Contracts>({
  name: "storageAt",
  batchable: false,
  description: "Read a raw storage slot of a contract.",
  returnType: "bytes32",
  args: [
    {
      name: "address",
      type: "address",
      description: "Contract or account address",
    },
    { name: "slot", type: "bytes32", description: "Storage slot index" },
  ],
  async run(module, { address, slot }) {
    const client = await module.getClient();
    const value = await client.getStorageAt({ address, slot });
    if (!value || value === "0x") {
      return "0x0000000000000000000000000000000000000000000000000000000000000000";
    }
    // Some RPCs strip leading zeros from storage values (e.g. returning a
    // 20-byte address for an EIP-1967 implementation slot). Left-pad to 32
    // bytes so the value satisfies the bytes32 contract.
    return pad(value, { size: 32 });
  },
});
