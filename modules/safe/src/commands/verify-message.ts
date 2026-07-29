import { defineCommand } from "@evmcrispr/sdk";
import type Safe from "..";
import { assertSafeVersion, getSafeMessageHashes } from "../utils";

export default defineCommand<Safe>({
  name: "verify-message",
  description:
    "Compute the EIP-712 hashes of an off-chain Safe message (plain string or typed-data JSON) so signers can verify what their wallet displays.",
  batchable: false,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "message",
      type: "string",
      description: "Raw message string, or an EIP-712 typed-data JSON document",
    },
  ],
  async run(module, { safe, message }) {
    const chainId = await module.getChainId();
    await assertSafeVersion(await module.getClient(), safe);

    const result = getSafeMessageHashes(chainId, safe, String(message));
    module.context.log(
      [
        `Safe message (safe ${safe}, chain ${chainId}, ${
          result.kind === "eip712" ? "EIP-712 typed data" : "EIP-191 message"
        })`,
        `  Raw message hash:  ${result.innerHash}`,
        `  Domain hash:       ${result.domainHash}`,
        `  Message hash:      ${result.messageHash}`,
        `  SafeMessage hash:  ${result.safeMessageHash}`,
      ].join("\n"),
    );

    return [];
  },
});
