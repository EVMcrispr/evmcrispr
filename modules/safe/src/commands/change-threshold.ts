import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Safe from "..";

export default defineCommand<Safe>({
  name: "change-threshold",
  description: "Change the signature threshold of the Safe.",
  args: [
    {
      name: "threshold",
      type: "number",
      description: "New signature threshold",
    },
  ],
  async run(module, { threshold }) {
    const safe = await module.resolveSafe();

    return [encodeAction(safe, "changeThreshold(uint256)", [threshold])];
  },
});
