// Sending the frames module's frame action, on the frame network of its
// chain. A plain sender's wallet is asked `eth_signTransaction` with a type
// 0x06 request, as a wallet that implements EIP-8141 signs it; a
// FrameAccount's owner authorizes the account's transaction with an EIP-712
// signature.
import { chainLabel, type ModuleActionSendCtx } from "@evmcrispr/sdk";
import {
  FrameWalletError,
  frameSidecarOf,
  printable,
  refusalText,
  sendFrameTransactionFromWallet,
} from "@evmcrispr/viem-frames";
import { sendAccountFrameTransaction } from "./account";
import { type FrameModuleAction, postVerifyCheckName } from "./frame-action";
import { requireLimits } from "./layout";
import { frameNetwork, frameNetworkNames } from "./networks";

/** What a wallet that refused to sign a plain sender's transaction is told. */
export const PLAIN_SENDER_HINT =
  "Send from a frame account with `--account`, or connect a wallet that signs frame transactions (the test wallet, experimental)";

/**
 * Sends the action as the host's gate passed it: only the nonce, the fees
 * and the signature are added. The network's RPC is the host's transport
 * for its chain, else the network's own. No confirmation is asked here: the
 * host's review and the wallet's prompt are the confirmation.
 */
export async function sendFrameAction(
  action: FrameModuleAction,
  ctx: ModuleActionSendCtx,
): Promise<unknown> {
  const { account, frames, mempool } = action.data;
  const network = frameNetwork(action.chainId);
  if (!network)
    throw new Error(
      `Frame transactions are sent on ${frameNetworkNames()}, not on ${chainLabel(action.chainId)}`,
    );
  const { chain } = network;
  if (mempool === "alt" && !frameSidecarOf(chain))
    throw new Error(
      `The ${chain.name} has no alt mempool: write \`--mempool canonical\``,
    );
  // Nothing sizes the frames yet: each carries its limits, said in EVML.
  requireLimits(frames);
  // The core's type says there is one; a run started without a wallet
  // would otherwise fail on the call below with viem's text.
  if (!ctx.walletClient)
    throw new Error(
      account
        ? `No wallet is connected: connect the account's owner ${printable(account.owner, 60)} to sign this frame transaction`
        : `No wallet is connected: connect the sender ${printable(action.from, 60)} to sign this frame transaction`,
    );
  // The wallet refuses to sign for another chain than its own, and changing
  // it is the script's to ask: it is never done here.
  const walletChain = await ctx.walletClient
    .getChainId()
    .catch((error: unknown) => {
      throw new Error(
        `The wallet did not say which chain it is on: ${printable(refusalText(error), 300)}`,
      );
    });
  if (walletChain !== chain.id)
    throw new Error(
      `The wallet is on ${chainLabel(walletChain)}, not the ${chain.name}: write \`switch ${network.switchTo}\` before this transaction`,
    );
  if (!network.mines)
    ctx.onLog(
      `:warning:The ${chain.name} never mines: the transaction is not waited on once admitted`,
    );
  const common = {
    wallet: ctx.walletClient,
    frames,
    mempool,
    chain,
    transport: ctx.transports?.[chain.id],
    // The console's marks for what viem-frames reports by level.
    onLog: (line: string, level: "info" | "success" | "warning") =>
      ctx.onLog(level === "info" ? line : `:${level}:${line}`),
    // A signature given after Cancel is dropped, never submitted.
    signal: ctx.signal,
    waitForReceipt: network.mines,
    fees: action.data.fees,
  };
  const { hash, receipt } = account
    ? await sendAccountFrameTransaction({
        ...common,
        account: action.from,
        owner: account.owner,
      })
    : await sendFrameTransactionFromWallet({
        ...common,
        sender: action.from,
      }).catch((error: unknown) => {
        if (error instanceof FrameWalletError)
          throw new Error(
            `${error.message.replace(/\.+$/, "")}. ${PLAIN_SENDER_HINT}`,
            {
              cause: error,
            },
          );
        throw error;
      });
  ctx.onSent?.(hash);
  // A post-verify check that failed on the chain: the transaction is mined,
  // its body reverted (measured on the Hegota devnet). Said by the check.
  const failed = receipt?.frameReceipts?.findIndex(
    (frame, i) => frames[i]?.mode === "postTx" && frame.status !== "success",
  );
  if (failed !== undefined && failed >= 0)
    throw new Error(
      `A post-verify check failed: ${postVerifyCheckName(frames, failed)} reverted, so the transaction's body was reverted (${hash})`,
    );
  // Admitted and never mined: the run records it as queued, not confirmed.
  return (
    receipt ?? {
      status: "queued",
      reason: `Admitted; the ${chain.name} never mines`,
      transactionHash: hash,
    }
  );
}
