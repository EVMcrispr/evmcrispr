import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import {
  acceptSafeInput,
  assertSafeVersion,
  classifySafeInput,
  fetchQueuedSignable,
  safeAbi,
  warnCompetingTransactions,
} from "../utils";
import { resolveOwnerPath } from "../utils/nested";
import { confirmThroughPath } from "../utils/queue";
import { logSafeSignable } from "../utils/sign";
import { kindLabel, signableHashes, signableSigners } from "../utils/signables";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "confirm",
  description:
    "Confirm a Safe transaction or Safe message queued on the Safe Transaction Service, as an owner or through an owner Safe.",
  batchable: false,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "hash",
      type: "bytes32",
      description: "safeTxHash, or safeMessageHash with --message",
    },
  ],
  opts: [
    {
      name: "message",
      type: "bool",
      description: "The hash is a safeMessageHash, not a safeTxHash",
    },
    {
      name: "via",
      type: "address",
      description:
        "Owner Safe to confirm through, when you own several owner Safes",
    },
  ],
  async run(module, { safe, hash }, { opts, interpreters }) {
    const chainId = await module.getChainId();
    const input = classifySafeInput(hash, {
      chainId,
      safe,
      message: opts.message,
    });
    acceptSafeInput(input, ["txHash", "messageHash"], "safe:confirm");
    const client = await module.getClient();
    await assertSafeVersion(client, safe);
    const { signable, serviceTx } = await fetchQueuedSignable(
      module,
      chainId,
      safe,
      input,
    );
    if (serviceTx?.isExecuted)
      throw new ErrorException(
        `Safe transaction ${input.hash} has already been executed`,
      );
    if (signable.kind === "transaction")
      await warnCompetingTransactions(
        module,
        chainId,
        safe,
        signable.tx.nonce,
        signable.safeTxHash,
      );
    logSafeSignable(module, signable);
    const path = await resolveOwnerPath(
      module,
      safe,
      await module.getConnectedAccount(true),
      opts.via,
    );
    // The owner slot this confirmation fills: yours, or your owner Safe's.
    const owner = path[1] ?? (await module.getConnectedAccount(true));
    const approved = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "approvedHashes",
      args: [owner, signableHashes(signable).finalHash],
    });
    if (
      approved > 0n ||
      (await signableSigners(signable)).some((s) =>
        isAddressEqual(s.owner, owner),
      )
    ) {
      module.context.log(
        `${owner} already confirmed this ${kindLabel(signable)}`,
      );
      return [];
    }
    await confirmThroughPath(module, interpreters, signable, path, {
      commandName: "safe:confirm",
      origin: "evmcrispr",
    });
    return [];
  },
});
