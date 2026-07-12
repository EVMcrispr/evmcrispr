import { defineHelper } from "@evmcrispr/sdk";
import type Safe from "..";
import { getOwners } from "../utils";

export default defineHelper<Safe>({
  name: "owners",
  description: "Return the owner addresses of a Safe.",
  returnType: "array",
  batchable: false,
  args: [
    {
      name: "safe",
      type: "address",
      optional: true,
      description:
        "Safe address (defaults to the context Safe or connected account)",
    },
  ],
  async run(module, { safe }) {
    return getOwners(await module.getClient(), await module.resolveSafe(safe));
  },
});
