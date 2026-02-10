import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Sim from "..";

export default defineCommand<Sim>({
  name: "set-storage-at",
  args: [
    { name: "address", type: "address" },
    { name: "slot", type: "bytes32" },
    { name: "value", type: "string" },
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
        method: `${module.mode}_setStorageAt`,
        params: [address, slot, value],
      },
    ];
  },
});
