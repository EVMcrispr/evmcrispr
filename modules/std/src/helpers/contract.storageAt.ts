import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "contract.storageAt",
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
    return (
      value ??
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
  },
});
