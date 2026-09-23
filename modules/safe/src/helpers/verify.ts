import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { assertSafeVersion } from "../utils";
import { stringifySafeTransaction } from "../utils/offline";
import { resolveSignable } from "../utils/resolve";
import { reviewSafeSignable } from "../utils/signables";

export default defineHelper<Safe>({
  name: "verify",
  description:
    "Verification report of a Safe transaction or Safe message as JSON: integrity-checked hashes, decoded calls, warnings, owner signature checks, on-chain approvals, readiness and competing transactions.",
  returnType: "string",
  batchable: false,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "target",
      type: ["number", "bytes32", "string"],
      description:
        "Nonce or safeTxHash of a queued transaction, a safeMessageHash with message:true, or Safe transaction or Safe message JSON",
    },
    {
      name: "message",
      type: "bool",
      namedOnly: true,
      description: "`message:true` — the hash is a safeMessageHash",
    },
    {
      name: "abi",
      type: "string",
      namedOnly: true,
      description:
        "`abi:<json>` — JSON mapping target addresses to explicit ABIs for local decoding",
    },
    {
      name: "no-rpc",
      type: "bool",
      namedOnly: true,
      description:
        "`no-rpc:true` — no network access at all (JSON only); owners, approvals, threshold and nonce stay unchecked",
    },
  ],
  async run(module, { safe, target, message, abi, "no-rpc": noRpc }) {
    let abis = {};
    if (abi !== undefined) {
      try {
        abis = JSON.parse(abi);
      } catch {
        throw new ErrorException(
          "abi: expected a JSON object mapping addresses to ABI arrays",
        );
      }
    }
    if (noRpc && (typeof target !== "string" || !target.trim().startsWith("{")))
      throw new ErrorException(
        "no-rpc:true needs Safe transaction or Safe message JSON; a nonce or hash is looked up on the Safe Transaction Service",
      );
    const { signable, skipped, competing } = await resolveSignable(
      module,
      safe,
      target,
      { message, helperName: "@safe:verify" },
    );
    const client = noRpc ? undefined : await module.getClient();
    if (client) await assertSafeVersion(client, safe);
    const report = await reviewSafeSignable(signable, client, abis);
    return stringifySafeTransaction({
      ...report,
      competing,
      skippedConfirmations: skipped,
    });
  },
});
