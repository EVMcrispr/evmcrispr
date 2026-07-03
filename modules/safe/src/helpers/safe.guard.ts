import { defineHelper } from "@evmcrispr/sdk";
import type Safe from "..";
import { getGuard } from "../utils";

export default defineHelper<Safe>({
  name: "safe.guard",
  description:
    "Return the transaction guard address of a Safe (the zero address when no guard is set).",
  returnType: "address",
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
    return getGuard(await module.getClient(), await module.resolveSafe(safe));
  },
});
