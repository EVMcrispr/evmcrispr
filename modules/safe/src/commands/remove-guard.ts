import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import type Safe from "..";

export default defineCommand<Safe>({
  name: "remove-guard",
  description: "Remove the transaction guard of the Safe.",
  args: [],
  async run(module) {
    const safe = await module.resolveSafe();

    return [encodeAction(safe, "setGuard(address)", [zeroAddress])];
  },
});
