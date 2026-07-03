import { defineHelper } from "@evmcrispr/sdk";
import type Safe from "..";
import { getModules } from "../utils";

export default defineHelper<Safe>({
  name: "safe.modules",
  description: "Return the enabled module addresses of a Safe.",
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
    return getModules(await module.getClient(), await module.resolveSafe(safe));
  },
});
