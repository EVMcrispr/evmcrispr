// Frame transactions in the terminal: only those from a FrameAccount, whose
// owner (the connected wallet) authorizes them with an EIP-712 signature.
// A plain frame transaction needs the sender's own key, which a browser
// wallet does not sign with: it is left to the core, which refuses it.
import type { ActionHandlers } from "@evmcrispr/core";
import {
  altMempoolDevnet,
  printable,
  sendAccountFrameTransaction,
} from "@evmcrispr/viem-frames";
import type { Transport } from "viem";

/**
 * The run's `frame` handler. The action it is given is the one the run's
 * gate passed, so the frames signed for are the reviewed ones: only the
 * nonce, the fees and the signature are added when it is sent.
 *
 * No confirmation is asked here: the run's review and the wallet's own
 * prompt are the confirmation.
 */
export function makeFrameHandler({
  transport,
}: {
  /** The alt-mempool gateway; the devnet's own by default. Never the
   *  wallet's RPC, nor a node configured for the chain. */
  transport?: Transport;
} = {}): ActionHandlers["frame"] {
  return async (action, ctx) => {
    if (!action.account) return ctx.next(action);
    const chainId = altMempoolDevnet.id;
    if (action.chainId !== chainId)
      throw new Error(
        `A frame account's transaction is sent on the ${altMempoolDevnet.name} (${chainId}), not on chain ${printable(action.chainId, 20)}`,
      );
    // The core's type says there is one; a run started without a wallet
    // would otherwise fail on the call below with viem's text.
    if (!ctx.walletClient)
      throw new Error(
        `No wallet is connected: connect the account's owner ${printable(action.account.owner, 60)} to sign this frame transaction`,
      );
    // The wallet refuses typed data for another chain than its own, and
    // changing it is the script's to ask: it is never done here.
    const walletChain = await ctx.walletClient.getChainId();
    if (walletChain !== chainId)
      throw new Error(
        `The wallet is on chain ${printable(walletChain, 20)}, not the ${altMempoolDevnet.name}: write \`switch ${chainId}\` before this transaction`,
      );
    const { hash, receipt } = await sendAccountFrameTransaction({
      wallet: ctx.walletClient,
      account: action.from,
      owner: action.account.owner,
      frames: action.frames,
      mempool: action.mempool,
      transport,
      onLog: ctx.onLog,
      // A signature given after Cancel is dropped, never submitted.
      signal: ctx.signal,
    });
    ctx.onSent?.(hash);
    return receipt;
  };
}
