import type {
  Address,
  BarewordNode,
  Node,
  NodesInterpreters,
} from "@evmcrispr/sdk";
import { ErrorException, encodeAction, NodeType } from "@evmcrispr/sdk";
import type { SmartBatchPlan } from "@evmcrispr/sdk/onchain";
import { type Hex, isAddressEqual } from "viem";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import { resolveOwnerPath, signsAlone, signThrough } from "./nested";
import { safeUint } from "./offline";
import { assertSafeVersion, getSafeNonce, getThreshold } from "./reads";
import { buildSafeTx } from "./safeTx";
import { logSafeSignable } from "./sign";
import {
  kindLabel,
  reviewSafeSignable,
  type SafeSignable,
  serviceSignature,
  signableSigners,
  transactionSignable,
} from "./signables";
import {
  confirmMessage,
  confirmTransaction,
  getNextNonce,
  getQueueLink,
  proposeMessage,
  proposeTransaction,
} from "./txService";

/** Post one owner signature slot: as the proposal of a new item (the owner
 *  is the sender), or as a confirmation of a queued one. */
async function postSignature(
  module: Safe,
  signable: SafeSignable,
  owner: Address,
  signature: Hex,
  { proposal, origin }: { proposal: boolean; origin: string },
) {
  const { chainId, safe } = signable;
  if (signable.kind === "transaction") {
    if (proposal)
      await proposeTransaction(module, chainId, {
        safe,
        tx: signable.tx,
        safeTxHash: signable.safeTxHash,
        sender: owner,
        signature,
        origin,
      });
    else
      await confirmTransaction(module, chainId, signable.safeTxHash, signature);
  } else if (proposal)
    await proposeMessage(
      module,
      chainId,
      safe,
      signable.content!,
      signature,
      origin,
    );
  else
    await confirmMessage(module, chainId, signable.safeMessageHash, signature);
}

const itemHash = (signable: SafeSignable) =>
  signable.kind === "transaction"
    ? signable.safeTxHash
    : signable.safeMessageHash;

/** Queue a Safe transaction or Safe message on the Safe Transaction Service.
 *  The owner signatures it carries are posted — EIP-712 ones, and owner Safe
 *  signatures once complete — the first proposing it and the rest becoming
 *  confirmations. Without any, the connected wallet signs, directly or
 *  through an owner Safe it completes alone. */
export async function postToService(
  module: Safe,
  interpreters: NodesInterpreters,
  signable: SafeSignable,
  {
    commandName,
    origin,
    executionPlan,
    via,
  }: {
    commandName: string;
    origin: string;
    executionPlan?: SmartBatchPlan;
    via?: Address;
  },
): Promise<void> {
  const { chainId, safe } = signable;
  const client = await module.getClient();
  const postable: { owner: Address; signature: Hex }[] = [];
  let pending = 0;
  if (signable.signatures.length) {
    const report = await reviewSafeSignable(signable, client);
    for (const s of await signableSigners(signable)) {
      if (typeof s.signature === "string") {
        postable.push({ owner: s.owner, signature: s.signature });
        continue;
      }
      const check = report.signatures.find(
        (c) => c.type === "contract" && isAddressEqual(c.owner, s.owner),
      );
      if (check?.status === "valid")
        postable.push({
          owner: s.owner,
          signature: await serviceSignature(chainId, s.owner, s.signature),
        });
      else pending++;
    }
  }
  if (postable.length === 0) {
    const path = await resolveOwnerPath(
      module,
      safe,
      await module.getConnectedAccount(true),
      via,
    );
    if (!(await signsAlone(client, path)))
      throw new ErrorException(
        `owner Safe ${path[1]} needs more signatures than yours, so it cannot propose alone: prepare the item with safe:propose-offline, collect the signatures with safe:confirm-offline, then post it with safe:propose`,
      );
    const { owner, signature } = await signThrough(
      module,
      interpreters,
      signable,
      path,
      commandName,
      executionPlan,
    );
    postable.push({
      owner,
      signature: await serviceSignature(chainId, owner, signature),
    });
  }

  const [proposer, ...confirmations] = postable;
  await postSignature(module, signable, proposer.owner, proposer.signature, {
    proposal: true,
    origin,
  });
  for (const { owner, signature } of confirmations)
    await postSignature(module, signable, owner, signature, {
      proposal: false,
      origin,
    });
  if (pending)
    module.context.log(
      `⚠️ WARNING: ${pending} owner Safe signature${pending === 1 ? " is" : "s are"} still incomplete and ${pending === 1 ? "was" : "were"} not posted; keep collecting ${pending === 1 ? "it" : "them"} with safe:confirm-offline`,
    );
  const hash =
    signable.kind === "transaction"
      ? `${signable.safeTxHash} (nonce ${signable.tx.nonce})`
      : signable.safeMessageHash;
  module.context.log(
    `Proposed Safe ${signable.kind} ${hash}${postable.length > 1 ? ` with ${postable.length} signatures` : ""}: ${getQueueLink(chainId, safe)}`,
  );
}

/** Confirm an item queued on the service, as the connected wallet through
 *  `path`. When the wallet completes every owner Safe alone, the signature
 *  is posted directly (off-chain, no gas). Otherwise the first owner Safe
 *  that needs more signatures confirms on-chain: an approveHash of the item
 *  is proposed in its own queue, recursively, the way Safe{Wallet} does. */
export async function confirmThroughPath(
  module: Safe,
  interpreters: NodesInterpreters,
  signable: SafeSignable,
  path: Address[],
  {
    commandName,
    origin,
    proposal = false,
  }: { commandName: string; origin: string; proposal?: boolean },
): Promise<void> {
  const client = await module.getClient();
  if (await signsAlone(client, path)) {
    const { owner, signature } = await signThrough(
      module,
      interpreters,
      signable,
      path,
      commandName,
    );
    await postSignature(
      module,
      signable,
      owner,
      await serviceSignature(signable.chainId, owner, signature),
      { proposal, origin },
    );
    module.context.log(
      proposal
        ? `Proposed Safe transaction ${itemHash(signable)} to the queue of Safe ${signable.safe}: ${getQueueLink(signable.chainId, signable.safe)}`
        : `Confirmed ${kindLabel(signable)} ${itemHash(signable)}${path.length > 1 ? ` as owner Safe ${path[1]}` : ""}`,
    );
    return;
  }
  const ownerSafe = path[1];
  const threshold = await getThreshold(client, ownerSafe);
  const confirmation = transactionSignable(
    signable.chainId,
    ownerSafe,
    buildSafeTx(
      [
        encodeAction(signable.safe, "approveHash(bytes32)", [
          itemHash(signable),
        ]),
      ],
      await getNextNonce(module, client, signable.chainId, ownerSafe),
      safeDeployment(signable.chainId),
    ),
  );
  module.context.log(
    `Owner Safe ${ownerSafe} needs ${threshold} signatures: queuing its on-chain confirmation (approveHash) of ${itemHash(signable)} in its own queue. Once its owners confirm and execute it, it counts for Safe ${signable.safe}.`,
  );
  logSafeSignable(module, confirmation);
  await confirmThroughPath(module, interpreters, confirmation, path.slice(1), {
    commandName,
    origin,
    proposal: true,
  });
}

/** The transaction the Safe web app uses to reject a pending one: a
 *  zero-value call from the Safe to itself at the same nonce. */
export const rejectionActions = (safe: `0x${string}`) => [{ to: safe }];

/** `cancel` written as a bare keyword (not the quoted text "cancel", which is
 *  a message) in place of a proposal's block. */
export const isCancelKeyword = (node: Node | undefined) =>
  node?.type === NodeType.Bareword && (node as BarewordNode).value === "cancel";

/** A rejection of whatever is pending at `nonce`. */
export async function rejectionSignable(
  module: Safe,
  safe: `0x${string}`,
  nonce: unknown,
): Promise<SafeSignable> {
  if (nonce === undefined)
    throw new ErrorException(
      "cancel needs --nonce: the nonce of the pending transaction to reject",
    );
  const chainId = await module.getChainId();
  const client = await module.getClient();
  await assertSafeVersion(client, safe);
  const at = safeUint(nonce, "nonce");
  const current = await getSafeNonce(client, safe);
  if (at < current)
    throw new ErrorException(
      `Safe nonce ${at} is already consumed (current on-chain nonce ${current}); there is nothing left to cancel`,
    );
  return transactionSignable(
    chainId,
    safe,
    buildSafeTx(rejectionActions(safe), at, safeDeployment(chainId)),
  );
}
