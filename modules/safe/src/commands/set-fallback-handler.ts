import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Safe from "..";

export default defineCommand<Safe>({
  name: "set-fallback-handler",
  description: "Set the fallback handler contract of the Safe.",
  args: [
    {
      name: "handler",
      type: "address",
      description: "Fallback handler contract address",
    },
  ],
  async run(module, { handler }) {
    const safe = await module.resolveSafe();

    return [encodeAction(safe, "setFallbackHandler(address)", [handler])];
  },
});
