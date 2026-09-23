import { defineHelper } from "@evmcrispr/sdk";
import type Safe from "..";
import { getSafeNonce } from "../utils";
import { safeUint } from "../utils/offline";
import { getQueuedTransactions } from "../utils/txService";

export default defineHelper<Safe>({
  name: "queue",
  description:
    "safeTxHashes of the trusted transactions queued on the Safe Transaction Service that can still execute (not executed, at the on-chain nonce or later), in nonce order, or with nonce:<n> only those at that nonce.",
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
    {
      name: "nonce",
      type: "number",
      namedOnly: true,
      description: "`nonce:<n>` — only the transactions queued at this nonce",
    },
  ],
  async run(module, { safe, nonce }) {
    const address = await module.resolveSafe(safe);
    const chainNonce = await getSafeNonce(await module.getClient(), address);
    const only = nonce === undefined ? undefined : safeUint(nonce, "nonce");
    if (only !== undefined && only < chainNonce) return [];
    const queued = await getQueuedTransactions(
      module,
      await module.getChainId(),
      address,
      only ?? chainNonce,
    );
    return queued
      .filter((t) => only === undefined || BigInt(t.nonce) === only)
      .map((t) => t.safeTxHash);
  },
});
