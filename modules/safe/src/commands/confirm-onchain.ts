import { defineCommand, ErrorException, encodeAction } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import {
  acceptSafeInput,
  assertSafeVersion,
  buildSafeTx,
  classifySafeInput,
  encodeExecTransaction,
  fetchQueuedSignable,
  getSafeNonce,
  getThreshold,
  preValidatedSignature,
  safeAbi,
} from "../utils";
import { ALLOW_OPTS } from "../utils/assess";
import { gateSignable } from "../utils/gate";
import { resolveOwnerPath, signsAlone, signThrough } from "../utils/nested";
import { logSafeSignable } from "../utils/sign";
import {
  expectKind,
  serviceSignature,
  signableHashes,
  transactionSignable,
} from "../utils/signables";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command reads the Safe and the transaction service while building, so it cannot be compiled into an atomic batch.",
  },
  name: "confirm-onchain",
  description:
    "Confirm a Safe transaction or Safe message on-chain with approveHash, as an owner or through an owner Safe you complete alone, instead of signing it off-chain.",
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "target",
      type: ["bytes32", "string"],
      description:
        "safeTxHash of a queued transaction (safeMessageHash with --message), or Safe transaction or Safe message JSON",
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
    ...ALLOW_OPTS,
  ],
  async run(module, { safe, target }, { opts, interpreters }) {
    const chainId = await module.getChainId();
    const input = classifySafeInput(target, {
      chainId,
      safe,
      message: opts.message,
    });
    acceptSafeInput(
      input,
      ["txHash", "messageHash", "signable"],
      "safe:confirm-onchain",
    );
    const client = await module.getClient();
    await assertSafeVersion(client, safe);
    // Confirm only what the fetched data hashes to: a bare hash would hide
    // what the approval authorizes.
    const signable =
      input.kind === "signable"
        ? input.signable
        : (await fetchQueuedSignable(module, chainId, safe, input)).signable;
    // The review refuses a consumed nonce along with the other checks.
    await gateSignable(module, signable, opts, "safe:confirm-onchain", {
      competing: input.kind === "txHash",
    });
    const hash = signableHashes(signable).finalHash;

    // approveHash counts for whoever sends it: the connected account, or an
    // enclosing Safe's block — directly or through an owner Safe.
    const account = await module.getSender();
    const path = await resolveOwnerPath(module, safe, account, opts.via);
    const approver = path[1] ?? account;
    const approved = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "approvedHashes",
      args: [approver, hash],
    });
    if (approved > 0n) {
      module.context.log(`${approver} already confirmed ${hash} on-chain`);
      return [];
    }
    const approve = encodeAction(safe, "approveHash(bytes32)", [hash]);
    if (path.length === 1) return [approve];

    // Through an owner Safe: it sends approveHash in a transaction of its
    // own, which the connected account can only complete alone.
    const ownerSafe = path[1];
    if (
      (await getThreshold(client, ownerSafe)) !== 1n ||
      !(await signsAlone(client, path.slice(1)))
    )
      throw new ErrorException(
        `owner Safe ${ownerSafe} needs more signatures than yours to confirm on-chain: queue its confirmation with safe:confirm, or collect the signatures with safe:confirm-offline`,
      );
    const wallet = await module.getConnectedAccount(true);
    if (path.length > 2 && !isAddressEqual(account, wallet))
      throw new ErrorException(
        "inside a Safe block, safe:confirm-onchain confirms as that Safe or one Safe it directly owns",
      );
    const confirmation = transactionSignable(
      chainId,
      ownerSafe,
      buildSafeTx(
        [approve],
        await getSafeNonce(client, ownerSafe),
        safeDeployment(chainId),
      ),
    );
    expectKind(confirmation, "transaction");
    module.context.log(
      `Owner Safe ${ownerSafe} confirms ${hash} for Safe ${safe}:`,
    );
    logSafeSignable(module, confirmation);
    // The sender of execTransaction approves by sending it.
    const signatures =
      path.length === 2
        ? preValidatedSignature(account)
        : await (async () => {
            const { owner, signature } = await signThrough(
              module,
              interpreters,
              confirmation,
              path.slice(1),
              "safe:confirm-onchain",
            );
            return serviceSignature(chainId, owner, signature);
          })();
    return [
      encodeExecTransaction(
        ownerSafe,
        confirmation.tx,
        signatures,
        confirmation.safeTxHash,
      ),
    ];
  },
});
