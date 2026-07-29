import { defineHelper } from "@evmcrispr/sdk";
import type Safe from "..";
import { assertSafeVersion, getSafeMessageHashes } from "../utils";

export default defineHelper<Safe>({
  name: "messageHash",
  description:
    "Return the SafeMessage hash of an off-chain message (plain string or typed-data JSON), as signed by Safe owners or SignMessageLib.",
  returnType: "bytes32",
  batchable: false,
  args: [
    {
      name: "message",
      type: "string",
      description: "Raw message string, or an EIP-712 typed-data JSON document",
    },
    {
      name: "safe",
      type: "address",
      optional: true,
      description:
        "Safe address (defaults to the context Safe or connected account)",
    },
  ],
  async run(module, { message, safe }) {
    const resolved = await module.resolveSafe(safe);
    await assertSafeVersion(await module.getClient(), resolved);
    return getSafeMessageHashes(
      await module.getChainId(),
      resolved,
      String(message),
    ).safeMessageHash;
  },
});
