// Sending the frames module's frame action: only from a FrameAccount, whose
// owner (the connected wallet) authorizes it with an EIP-712 signature. A
// plain frame transaction needs the sender's own key, which a browser
// wallet does not sign with (step 3 of the frames-in-module design).
import { chainLabel, type ModuleActionSendCtx } from "@evmcrispr/sdk";
import { altMempoolDevnet, printable } from "@evmcrispr/viem-frames";
import { sendAccountFrameTransaction } from "./account";
import { PLAIN_SENDER_REFUSAL } from "./describe";
import type { FrameModuleAction } from "./frame-action";

/**
 * Sends the action as the host's gate passed it: only the nonce, the fees
 * and the signature are added. The alt-mempool gateway is the host's
 * transport for the devnet's chain (the terminal's is the gateway), else
 * the devnet's own. No confirmation is asked here: the host's review and
 * the wallet's prompt are the confirmation.
 */
export async function sendFrameAction(
  action: FrameModuleAction,
  ctx: ModuleActionSendCtx,
): Promise<unknown> {
  const { account, frames, mempool } = action.data;
  if (!account) throw new Error(PLAIN_SENDER_REFUSAL);
  const devnet = altMempoolDevnet;
  if (action.chainId !== devnet.id)
    throw new Error(
      `A frame account's transaction is sent on the ${devnet.name}, not on ${chainLabel(action.chainId)}`,
    );
  // The core's type says there is one; a run started without a wallet
  // would otherwise fail on the call below with viem's text.
  if (!ctx.walletClient)
    throw new Error(
      `No wallet is connected: connect the account's owner ${printable(account.owner, 60)} to sign this frame transaction`,
    );
  // The wallet refuses typed data for another chain than its own, and
  // changing it is the script's to ask: it is never done here.
  const walletChain = await ctx.walletClient.getChainId();
  if (walletChain !== devnet.id)
    throw new Error(
      `The wallet is on ${chainLabel(walletChain)}, not the ${devnet.name}: write \`switch ${devnet.id}\` before this transaction`,
    );
  const { hash, receipt } = await sendAccountFrameTransaction({
    wallet: ctx.walletClient,
    account: action.from,
    owner: account.owner,
    frames,
    mempool,
    transport: ctx.transports?.[devnet.id],
    // The console's marks for what viem-frames reports by level.
    onLog: (line, level) =>
      ctx.onLog(level === "info" ? line : `:${level}:${line}`),
    // A signature given after Cancel is dropped, never submitted.
    signal: ctx.signal,
  });
  ctx.onSent?.(hash);
  return receipt;
}
