import type { Address } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import {
  encodeFunctionData,
  isAddressEqual,
  parseAbi,
  zeroAddress,
} from "viem";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import type { SafeTx, ServiceTransaction } from "../utils";
import {
  assertSafeVersion,
  collectSafeTxWarnings,
  formatSafeTxHashesLog,
  getSafeNonce,
  getSafeTxHashes,
  getServiceTransaction,
  getServiceTransactionsByNonce,
  serviceTxToSafeTx,
  toBigInt,
} from "../utils";

const approveHashAbi = parseAbi([
  "function approveHash(bytes32 hashToApprove)",
]);

export default defineCommand<Safe>({
  name: "verify",
  description:
    "Recompute the EIP-712 domain, message and safeTxHash of a queued Safe transaction locally, check them against the Safe Transaction Service and flag dangerous fields, so signers can verify what their wallet displays.",
  batchable: false,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "proposal",
      type: ["number", "bytes32"],
      description: "Nonce or safeTxHash of the queued transaction",
    },
  ],
  opts: [
    {
      name: "nested-safe",
      type: "address",
      description:
        "Owner Safe that will approve the transaction via approveHash; also prints the hashes its owners must sign",
    },
    {
      name: "nested-safe-nonce",
      type: "number",
      description: "Nonce override for the nested Safe approveHash transaction",
    },
  ],
  async run(module, { safe, proposal }, { opts }) {
    const chainId = await module.getChainId();
    const client = await module.getClient();
    await assertSafeVersion(client, safe);

    const nestedSafe = opts["nested-safe"] as Address | undefined;
    if (opts["nested-safe-nonce"] !== undefined && !nestedSafe) {
      throw new ErrorException(
        "--nested-safe-nonce requires --nested-safe to be set",
      );
    }

    let serviceTxs: ServiceTransaction[];
    if (typeof proposal === "string") {
      serviceTxs = [await getServiceTransaction(module, chainId, proposal)];
    } else {
      const nonce = toBigInt(proposal);
      serviceTxs = await getServiceTransactionsByNonce(
        module,
        chainId,
        safe,
        nonce,
      );
      if (serviceTxs.length === 0) {
        throw new ErrorNotFound(
          `no queued transaction found for Safe ${safe} at nonce ${nonce}`,
        );
      }
      if (serviceTxs.length > 1) {
        module.context.log(
          `⚠️ WARNING: ${serviceTxs.length} transactions are queued at nonce ${nonce} — only one can execute; make sure the safeTxHash you sign matches the intended one`,
        );
      }
    }

    for (const serviceTx of serviceTxs) {
      if (!isAddressEqual(serviceTx.safe, safe)) {
        throw new ErrorException(
          `Safe transaction ${serviceTx.safeTxHash} belongs to Safe ${serviceTx.safe}, not ${safe}`,
        );
      }

      const tx = serviceTxToSafeTx(serviceTx);
      const hashes = getSafeTxHashes(chainId, safe, tx);
      if (
        hashes.safeTxHash.toLowerCase() !== serviceTx.safeTxHash.toLowerCase()
      ) {
        throw new ErrorException(
          `safeTxHash mismatch: locally computed ${hashes.safeTxHash} but the Safe Transaction Service reports ${serviceTx.safeTxHash} — the service data may be tampered with; do NOT sign or execute this transaction`,
        );
      }

      module.context.log(
        formatSafeTxHashesLog(
          safe,
          chainId,
          tx,
          hashes,
          collectSafeTxWarnings(tx, safeDeployment(chainId)),
        ),
      );

      if (nestedSafe) {
        await assertSafeVersion(client, nestedSafe);
        const nestedTx: SafeTx = {
          to: safe,
          value: 0n,
          data: encodeFunctionData({
            abi: approveHashAbi,
            functionName: "approveHash",
            args: [hashes.safeTxHash],
          }),
          operation: 0,
          safeTxGas: 0n,
          baseGas: 0n,
          gasPrice: 0n,
          gasToken: zeroAddress,
          refundReceiver: zeroAddress,
          nonce:
            opts["nested-safe-nonce"] !== undefined
              ? toBigInt(opts["nested-safe-nonce"])
              : await getSafeNonce(client, nestedSafe),
        };
        module.context.log(
          `Nested Safe approveHash transaction (to be signed by the owners of ${nestedSafe}):\n${formatSafeTxHashesLog(
            nestedSafe,
            chainId,
            nestedTx,
            getSafeTxHashes(chainId, nestedSafe, nestedTx),
            [],
          )}`,
        );
      }
    }

    return [];
  },
});
