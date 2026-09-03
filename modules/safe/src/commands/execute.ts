import type { Address, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import {
  buildSafeTx,
  collectSafeTxWarnings,
  encodeExecTransaction,
  formatSafeTxHashesLog,
  getOwners,
  getSafeNonce,
  getSafeTxHashes,
  getServiceTransaction,
  getThreshold,
  interpretSafeBlock,
  preValidatedSignature,
  serviceTxToSafeTx,
} from "../utils";

export default defineCommand<Safe>({
  name: "execute",
  description:
    "Execute a Safe transaction on-chain: either a block of commands (connected owner of a 1-threshold Safe) or a fully-confirmed queued transaction by its hash.",
  batchable: false,
  createsBatchContext: true,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "proposal",
      type: ["block", "bytes32"],
      description:
        "Commands composing the transaction, or the safeTxHash of a queued transaction",
    },
  ],
  async run(module, { safe, proposal }, { interpreters }) {
    const chainId = await module.getChainId();
    const client = await module.getClient();

    // Hash form: execute a queued transaction confirmed on the service.
    if (typeof proposal === "string") {
      const serviceTx = await getServiceTransaction(module, chainId, proposal);

      if (!isAddressEqual(serviceTx.safe, safe)) {
        throw new ErrorException(
          `Safe transaction ${proposal} belongs to Safe ${serviceTx.safe}, not ${safe}`,
        );
      }

      // Never trust the service's fields: they must hash back to the
      // requested safeTxHash, or the signatures would cover different data.
      const tx = serviceTxToSafeTx(serviceTx);
      const hashes = getSafeTxHashes(chainId, safe, tx);
      if (hashes.safeTxHash.toLowerCase() !== proposal.toLowerCase()) {
        throw new ErrorException(
          `the transaction data returned by the Safe Transaction Service hashes to ${hashes.safeTxHash}, not ${proposal}; refusing to execute possibly tampered data (note: only Safe >=1.3.0 is supported)`,
        );
      }

      if (serviceTx.isExecuted) {
        throw new ErrorException(
          `Safe transaction ${proposal} has already been executed`,
        );
      }

      const confirmations = serviceTx.confirmations ?? [];
      if (confirmations.length < serviceTx.confirmationsRequired) {
        throw new ErrorException(
          `Safe transaction ${proposal} has ${confirmations.length} of ${serviceTx.confirmationsRequired} required confirmations`,
        );
      }

      // execTransaction expects the 65-byte signatures concatenated in
      // ascending signer address order.
      const signatures = confirmations
        .slice()
        .sort((a, b) =>
          a.owner.toLowerCase() < b.owner.toLowerCase() ? -1 : 1,
        )
        .reduce<`0x${string}`>(
          (acc, c) => `${acc}${c.signature.slice(2)}` as `0x${string}`,
          "0x",
        );

      module.context.log(
        formatSafeTxHashesLog(
          safe,
          chainId,
          tx,
          hashes,
          collectSafeTxWarnings(tx, safeDeployment(chainId)),
        ),
      );

      return [encodeExecTransaction(safe, tx, signatures)];
    }

    // Block form: build and execute directly with the sender's
    // pre-validated signature.
    const actions = await interpretSafeBlock(
      module,
      safe,
      proposal as BlockExpressionNode,
      "safe:execute",
      interpreters,
    );

    if (actions.length === 0) {
      return [];
    }

    const sender = await module.getConnectedAccount(true);
    const [owners, threshold] = await Promise.all([
      getOwners(client, safe),
      getThreshold(client, safe),
    ]);

    if (!owners.some((o) => isAddressEqual(o, sender as Address))) {
      throw new ErrorException(
        `connected account ${sender} is not an owner of Safe ${safe}`,
      );
    }
    if (threshold !== 1n) {
      throw new ErrorException(
        `Safe ${safe} has a threshold of ${threshold}; use safe:propose to collect the remaining signatures`,
      );
    }

    const nonce = await getSafeNonce(client, safe);
    const tx = buildSafeTx(actions, nonce, safeDeployment(chainId));

    return [
      {
        ...encodeExecTransaction(safe, tx, preValidatedSignature(sender)),
        from: sender,
      },
    ];
  },
});
