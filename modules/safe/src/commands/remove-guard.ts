import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import type Safe from "..";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "static",
    reason:
      "This command has no value arguments; it emits the fixed guard removal call.",
  },
  name: "remove-guard",
  description: "Remove the transaction guard of the Safe.",
  args: [],
  async run(module) {
    const safe = await module.resolveSafe();

    return [encodeAction(safe, "setGuard(address)", [zeroAddress])];
  },
});
