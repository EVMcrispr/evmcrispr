import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import {
  acceptSafeInput,
  assertSafeVersion,
  buildSafeTx,
  classifySafeInput,
  getNextNonce,
  getSafeNonce,
  interpretSafeBlock,
  smartPlanFor,
} from "../utils";
import { ALLOW_OPTS } from "../utils/assess";
import { gateSignable } from "../utils/gate";
import { safeUint } from "../utils/offline";
import {
  isCancelKeyword,
  postToService,
  rejectionSignable,
  resolveProposer,
} from "../utils/queue";
import {
  contentMessageSignable,
  type SafeSignable,
  transactionSignable,
} from "../utils/signables";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "propose",
  description:
    "Queue a Safe transaction, rejection or Safe message on the Safe Transaction Service: a command block, cancel or a message, signed by the wallet as an owner (its confirmation) or a delegate, or signed JSON.",
  batchable: false,
  createsBatchContext: true,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "proposal",
      supportsSmartBlock: true,
      type: ["block", "string"],
      description:
        "Commands composing the transaction, `cancel` (with --nonce) to reject a pending one, a message (text or EIP-712 typed data), or signed Safe transaction or Safe message JSON",
    },
  ],
  opts: [
    {
      name: "salt",
      type: "bytes32",
      description:
        "Smart-batch storage salt for reproducible offline signing (block forms with !)",
    },
    {
      name: "nonce",
      type: "number",
      description:
        "Safe nonce for a command block (defaults to the next free service nonce), or of the pending transaction to cancel",
    },
    {
      name: "origin",
      type: "string",
      description: "Origin tag shown in the Safe UI",
    },
    {
      name: "via",
      type: "address",
      description:
        "Owner Safe to sign through, when you own several owner Safes",
    },
    ...ALLOW_OPTS,
  ],
  async run(module, { safe, proposal }, { opts, interpreters, node }) {
    const chainId = await module.getChainId();
    // The wallet's signature proposes it: an owner's is its confirmation,
    // a delegate's vouches for it in the Safe web app. Both are reviewed.
    if (isCancelKeyword(node.args[1])) {
      const rejection = await rejectionSignable(module, safe, opts.nonce);
      const proposedBy = await resolveProposer(module, safe, opts.via);
      await gateSignable(module, rejection, opts, "safe:propose", {
        competing: true,
      });
      await postToService(module, interpreters, rejection, {
        commandName: "safe:propose",
        origin: opts.origin ?? "evmcrispr",
        via: opts.via,
        proposedBy,
      });
      return [];
    }
    const input = classifySafeInput(proposal, { chainId, safe });
    if (input.kind === "nested")
      throw new ErrorException(
        `this JSON belongs to Safe ${input.parent.safe}: to approve it as its owner Safe, run safe:confirm, safe:confirm-offline or safe:confirm-onchain on Safe ${input.parent.safe}; the owner Safe is found automatically`,
      );
    acceptSafeInput(input, ["block", "signable", "content"], "safe:propose");
    if (
      opts.salt !== undefined &&
      !(input.kind === "block" && input.block.smart)
    )
      throw new ErrorException("--salt requires a smart block (!(...))");
    if (input.kind !== "block" && opts.nonce !== undefined)
      throw new ErrorException(
        "--nonce only applies to a command block; Safe transaction JSON already fixes its nonce",
      );
    const actions =
      input.kind === "block"
        ? await interpretSafeBlock(
            module,
            safe,
            input.block,
            "safe:propose",
            interpreters,
            { salt: opts.salt },
          )
        : undefined;
    if (actions?.length === 0) return [];
    const client = await module.getClient();
    await assertSafeVersion(client, safe);

    const signable: SafeSignable =
      input.kind === "signable"
        ? input.signable
        : input.kind === "content"
          ? contentMessageSignable(chainId, safe, input.content)
          : transactionSignable(
              chainId,
              safe,
              buildSafeTx(
                actions!,
                opts.nonce !== undefined
                  ? safeUint(opts.nonce, "nonce")
                  : await getNextNonce(module, client, chainId, safe),
                safeDeployment(chainId),
              ),
            );
    if (signable.kind === "message" && signable.content === undefined)
      throw new ErrorException(
        "this Safe message has no text or typed-data content (it signs another Safe's signing bytes), which the Safe Transaction Service cannot accept; collect its signatures with safe:confirm-offline",
      );
    if (signable.kind === "transaction") {
      const chainNonce = await getSafeNonce(client, safe);
      if (signable.tx.nonce < chainNonce)
        throw new ErrorException(
          `Safe nonce ${signable.tx.nonce} is already consumed (current on-chain nonce ${chainNonce})`,
        );
    }
    // JSON that already carries signatures is posted as it is: posting adds
    // none, and its signers were reviewed when they signed. Otherwise the
    // wallet signs, as an owner or a delegate, and is reviewed.
    const proposedBy = signable.signatures.length
      ? undefined
      : await resolveProposer(module, safe, opts.via);
    await gateSignable(module, signable, opts, "safe:propose", {
      competing: signable.kind === "transaction",
      enforce: proposedBy !== undefined,
    });
    await postToService(module, interpreters, signable, {
      commandName: "safe:propose",
      origin: opts.origin ?? "evmcrispr",
      executionPlan: smartPlanFor(actions),
      via: opts.via,
      proposedBy,
    });
    return [];
  },
});
