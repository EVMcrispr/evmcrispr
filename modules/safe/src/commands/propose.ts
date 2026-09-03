import type { BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import {
  buildSafeTx,
  collectSafeTxWarnings,
  formatSafeTxHashesLog,
  getNextNonce,
  getQueueLink,
  getSafeTxHashes,
  getSafeTxTypedData,
  interpretSafeBlock,
  proposeTransaction,
  toBigInt,
} from "../utils";

const stringifyTypedData = (typedData: unknown): string =>
  JSON.stringify(typedData, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );

export default defineCommand<Safe>({
  name: "propose",
  description:
    "Propose a transaction to the Safe queue through the Safe Transaction Service, signed by the connected owner or delegate.",
  batchable: false,
  createsBatchContext: true,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "block",
      type: "block",
      description: "Commands composing the proposed transaction",
    },
  ],
  opts: [
    {
      name: "nonce",
      type: "number",
      description: "Safe nonce override (defaults to the next free nonce)",
    },
    {
      name: "origin",
      type: "string",
      description: "Origin tag shown in the Safe UI",
    },
  ],
  async run(module, { safe, block }, { opts, interpreters }) {
    const actions = await interpretSafeBlock(
      module,
      safe,
      block as BlockExpressionNode,
      "safe:propose",
      interpreters,
    );

    if (actions.length === 0) {
      return [];
    }

    const { actionCallback } = interpreters;
    if (!actionCallback) {
      throw new ErrorException(
        "safe:propose requires an execution context with wallet access",
      );
    }

    const chainId = await module.getChainId();
    const client = await module.getClient();

    const nonce =
      opts.nonce !== undefined
        ? toBigInt(opts.nonce)
        : await getNextNonce(module, client, chainId, safe);

    const tx = buildSafeTx(actions, nonce, safeDeployment(chainId));
    const hashes = getSafeTxHashes(chainId, safe, tx);
    const { safeTxHash } = hashes;
    const sender = await module.getConnectedAccount(true);

    // Print the hashes before the wallet prompt so the signer can compare
    // them against the hardware wallet display.
    module.context.log(
      formatSafeTxHashesLog(
        safe,
        chainId,
        tx,
        hashes,
        collectSafeTxWarnings(tx, safeDeployment(chainId)),
      ),
    );

    const signature = (await actionCallback({
      type: "wallet",
      method: "eth_signTypedData_v4",
      params: [
        sender,
        stringifyTypedData(getSafeTxTypedData(chainId, safe, tx)),
      ],
    })) as `0x${string}`;

    await proposeTransaction(module, chainId, {
      safe,
      tx,
      safeTxHash,
      sender,
      signature,
      origin: opts.origin ?? "evmcrispr",
    });

    module.context.log(
      `Proposed Safe transaction ${safeTxHash} (nonce ${nonce}): ${getQueueLink(chainId, safe)}`,
    );

    return [];
  },
});
