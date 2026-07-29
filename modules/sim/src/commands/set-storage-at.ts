import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Sim from "..";
import { rpcPrefix } from "../lib/modes";

export default defineCommand<Sim>({
  name: "set-storage-at",
  description: "Set a storage slot value at an address in a fork simulation.",
  batchable: false,
  args: [
    {
      name: "address",
      type: "address",
      description: "Contract or account address",
    },
    { name: "slot", type: "bytes32", description: "Storage slot" },
    { name: "value", type: "string", description: "New 32-byte value" },
  ],
  async run(module, { address, slot, value }) {
    if (!module.mode) {
      throw new ErrorException(
        "set-storage-at can only be used inside a fork block",
      );
    }

    return [
      {
        type: "rpc",
        method: `${rpcPrefix(module.mode)}_setStorageAt`,
        params: [address, slot, value],
      },
    ];
  },
});
