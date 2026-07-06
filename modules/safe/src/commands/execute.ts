import type { Address, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import type { SafeTx } from "../utils";
import {
  buildSafeTx,
  encodeExecTransaction,
  getOwners,
  getSafeNonce,
  getServiceTransaction,
  getThreshold,
  interpretSafeBlock,
  preValidatedSignature,
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

      const tx: SafeTx = {
        to: serviceTx.to,
        value: BigInt(serviceTx.value),
        data: serviceTx.data ?? "0x",
        operation: serviceTx.operation,
        safeTxGas: BigInt(serviceTx.safeTxGas),
        baseGas: BigInt(serviceTx.baseGas),
        gasPrice: BigInt(serviceTx.gasPrice),
        gasToken: serviceTx.gasToken,
        refundReceiver: serviceTx.refundReceiver,
        nonce: BigInt(serviceTx.nonce),
      };

      return [encodeExecTransaction(serviceTx.safe, tx, signatures)];
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
    const tx = buildSafeTx(actions, nonce);

    return [
      {
        ...encodeExecTransaction(safe, tx, preValidatedSignature(sender)),
        from: sender,
      },
    ];
  },
});
