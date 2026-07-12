import { ErrorException } from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import type { CowOrder } from "./lib/cowApi";
import {
  buildOrderTypedData,
  COW_NATIVE_BUY,
  COW_NETWORKS,
  COW_VAULT_RELAYER,
  explorerLink,
  fetchCowQuote,
  postOrder,
} from "./lib/cowApi";
import type { VenueAdapter } from "./types";

const MAX_UINT32 = 0xffffffff;

function toValidTo(deadline: bigint): number {
  return deadline > BigInt(MAX_UINT32) ? MAX_UINT32 : Number(deadline);
}

const cowswap: VenueAdapter = {
  name: "CoWSwap",
  kind: "intent",
  supportsExactOut: true,
  supports: (chainId) => chainId in COW_NETWORKS,

  async quote(module, req) {
    if (req.tokenIn === zeroAddress) {
      throw new ErrorException(
        "CoWSwap cannot sell the native token; wrap it first with swaps:wrap",
      );
    }
    const from = req.from ?? (await module.getConnectedAccount(true));
    const client = await module.getClient();
    const block = await client.getBlock();
    const quote = await fetchCowQuote(req.chainId, {
      sellToken: req.tokenIn,
      buyToken: req.tokenOut === zeroAddress ? COW_NATIVE_BUY : req.tokenOut,
      from,
      receiver: from,
      kind: req.kind === "exactIn" ? "sell" : "buy",
      amount: req.amount,
      validTo: toValidTo(block.timestamp + 1200n),
    });
    // The fee is taken from the sell side, so the total spend is
    // sellAmount + feeAmount for both order kinds.
    return {
      amountIn: BigInt(quote.sellAmount) + BigInt(quote.feeAmount),
      amountOut: BigInt(quote.buyAmount),
      route: quote,
    };
  },

  async buildSwap(module, req, { interpreters }) {
    if (req.tokenIn === zeroAddress) {
      throw new ErrorException(
        "CoWSwap cannot sell the native token; wrap it first with swaps:wrap",
      );
    }
    const { actionCallback } = interpreters;
    if (!actionCallback) {
      throw new ErrorException(
        "CoWSwap orders require an execution context with wallet access",
      );
    }

    const owner = req.from;
    const client = await module.getClient();
    const code = await client.getCode({ address: owner });
    // EIP-7702-delegated EOAs (code 0xef0100...) can still sign as EOAs;
    // only true smart-contract accounts need EIP-1271.
    if (code && code !== "0x" && !code.startsWith("0xef0100")) {
      throw new ErrorException(
        "the connected account is a smart contract; CoWSwap EIP-712 orders need an EOA signer (EIP-1271 signing is not supported yet)",
      );
    }

    const validTo = toValidTo(req.deadline);
    const buyToken =
      req.tokenOut === zeroAddress ? COW_NATIVE_BUY : req.tokenOut;
    const quote = await fetchCowQuote(req.chainId, {
      sellToken: req.tokenIn,
      buyToken,
      from: owner,
      receiver: req.recipient,
      kind: req.kind === "exactIn" ? "sell" : "buy",
      amount: req.amount,
      validTo,
    });

    // Orders must carry feeAmount 0 with the quoted fee folded into the
    // sell side; the limit provides our own slippage protection.
    const order: CowOrder = {
      sellToken: req.tokenIn,
      buyToken,
      receiver: req.recipient,
      sellAmount:
        req.kind === "exactIn"
          ? BigInt(quote.sellAmount) + BigInt(quote.feeAmount)
          : req.limit,
      buyAmount: req.kind === "exactIn" ? req.limit : req.amount,
      validTo,
      appData: quote.appData,
      feeAmount: 0n,
      kind: quote.kind,
      partiallyFillable: quote.partiallyFillable,
      sellTokenBalance: quote.sellTokenBalance,
      buyTokenBalance: quote.buyTokenBalance,
    };

    const signature = (await actionCallback({
      type: "wallet",
      method: "eth_signTypedData_v4",
      params: [owner, buildOrderTypedData(req.chainId, order)],
    })) as `0x${string}`;

    const orderUid = await postOrder(req.chainId, order, owner, signature);
    module.context.log(
      `Placed CoWSwap order ${orderUid}: ${explorerLink(req.chainId, orderUid)}`,
    );

    // The only on-chain action left is the sell-token approval (handled by
    // the command's auto-approve); the order itself settles off-chain.
    return {
      approvalTarget: COW_VAULT_RELAYER,
      approvalAmount: order.sellAmount,
      actions: [],
    };
  },
};

export default cowswap;
