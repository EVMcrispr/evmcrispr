import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { assertSafeVersion } from "../utils";
import { resolveSignable } from "../utils/resolve";
import { kindLabel, reviewSafeSignable } from "../utils/signables";

export default defineHelper<Safe>({
  name: "signature",
  description:
    "Packed owner signatures of a Safe transaction or Safe message once enough owners have signed, e.g. the EIP-1271 signature a dapp asks for.",
  returnType: "bytes",
  batchable: false,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "target",
      type: ["bytes32", "string"],
      description:
        "Safe transaction or Safe message JSON, a safeTxHash, or a safeMessageHash with message:true",
    },
    {
      name: "message",
      type: "bool",
      namedOnly: true,
      description: "`message:true` — the hash is a safeMessageHash",
    },
  ],
  async run(module, { safe, target, message }) {
    const { signable } = await resolveSignable(module, safe, target, {
      message,
      helperName: "@safe:signature",
    });
    const client = await module.getClient();
    await assertSafeVersion(client, safe);
    const report = await reviewSafeSignable(signable, client);
    if (!report.ready)
      throw new ErrorException(
        `${kindLabel(signable)} is not ready: ${report.readiness} (${report.signatures.filter((s) => s.status === "valid").length} of ${report.chain.threshold} required owner signatures)`,
      );
    return report.packedSignatures;
  },
});
