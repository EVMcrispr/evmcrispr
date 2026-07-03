import { defineHelper, Num } from "@evmcrispr/sdk";
import type Safe from "..";
import { getSafeNonce } from "../utils";

export default defineHelper<Safe>({
  name: "safe.nonce",
  description: "Return the current on-chain nonce of a Safe.",
  returnType: "number",
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
    return Num.fromBigInt(
      await getSafeNonce(
        await module.getClient(),
        await module.resolveSafe(safe),
      ),
    );
  },
});
