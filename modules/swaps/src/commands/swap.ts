import type { Action } from "@evmcrispr/sdk";
import {
  coerceBoolean,
  defineCommand,
  ErrorException,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import type Swaps from "..";
import { WRAPPED_NATIVE } from "../addresses";
import { applySlippageDown, pctToBps } from "../utils/amounts";
import { buildApprovalActions } from "../utils/approval";
import { resolveDeadline } from "../utils/deadline";
import { sameAddress } from "../utils/tokens";
import { resolveVenue } from "../venues/registry";
import type { Quote } from "../venues/types";

const DEFAULT_SLIPPAGE_PCT = 0.5;

export default defineCommand<Swaps>({
  name: "swap",
  description:
    "Sell an exact amount of one token for another on a DEX or aggregator, approving the venue automatically when needed. Slippage protection comes from --min, or --slippage applied to a quote (default 0.5%).",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount of tokenIn to sell, in base units (wei)",
    },
    {
      name: "tokenIn",
      type: "address",
      description:
        "Token to sell (use @token(SYM); the native token resolves to the zero address)",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "tokenOut", type: "address", description: "Token to buy" },
  ],
  opts: [
    {
      name: "min",
      type: "number",
      description: "Minimum output in base units (overrides --slippage)",
    },
    {
      name: "slippage",
      type: "number",
      description: "Maximum slippage vs. the quote, in percent (default 0.5)",
    },
    {
      name: "using",
      type: "swap-venue",
      description:
        "Venue: Delora, UniswapV3, UniswapV2, Honeyswap, SushiSwap, or CoWSwap (default: the best venue available on the chain)",
    },
    {
      name: "to",
      type: "address",
      description:
        "Recipient of the output (defaults to the connected account)",
    },
    {
      name: "deadline",
      type: "number",
      description:
        "Unix timestamp after which the swap reverts (default: 20 minutes after the latest block)",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
    },
  ],
  completions: {
    to: () => [fieldItem("to")],
  },
  batchable: (_args, opts) =>
    String(opts.using ?? "").toLowerCase() !== "cowswap" ||
    "CoWSwap signs and posts an off-chain order and cannot run inside a batch",
  async run(module, { amount, tokenIn, tokenOut, to }, { opts, interpreters }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    if (sameAddress(tokenIn, tokenOut)) {
      throw new ErrorException("<tokenIn> and <tokenOut> are the same token");
    }

    const chainId = await module.getChainId();
    const wrapped = WRAPPED_NATIVE[chainId];
    if (tokenIn === zeroAddress && sameAddress(tokenOut, wrapped)) {
      throw new ErrorException(
        "wrapping the native token is not a swap; use swaps:wrap",
      );
    }
    if (sameAddress(tokenIn, wrapped) && tokenOut === zeroAddress) {
      throw new ErrorException(
        "unwrapping the native token is not a swap; use swaps:unwrap",
      );
    }

    const amountIn = Num(amount).toBigInt();
    if (amountIn <= 0n) {
      throw new ErrorException("<amount> must be greater than zero");
    }

    const owner = await module.getConnectedAccount(true);
    const recipient = opts.to ?? owner;
    const venue = await resolveVenue(module, opts.using);
    if (interpreters.batchContext && venue.kind === "intent") {
      throw new ErrorException(
        `${venue.name} signs and posts an off-chain order and cannot run inside a ${interpreters.batchContext.name}`,
      );
    }

    const quoteReq = {
      chainId,
      tokenIn,
      tokenOut,
      amount: amountIn,
      kind: "exactIn" as const,
      from: owner,
    };
    const slippageBps = pctToBps(
      opts.slippage !== undefined
        ? Num(opts.slippage).toNumber()
        : DEFAULT_SLIPPAGE_PCT,
    );

    let limit: bigint;
    let quote: Quote | undefined;
    if (opts.min !== undefined) {
      limit = Num(opts.min).toBigInt();
    } else {
      if (interpreters.batchContext?.hasActions) {
        throw new ErrorException(
          `the quote backing --slippage runs at batch-build time and cannot observe earlier actions in the same ${interpreters.batchContext.name}; pass an explicit --min bound instead`,
        );
      }
      quote = await venue.quote(module, quoteReq);
      limit = applySlippageDown(quote.amountOut, slippageBps);
    }

    const deadline = await resolveDeadline(module, opts);
    const plan = await venue.buildSwap(
      module,
      { ...quoteReq, limit, slippageBps, recipient, deadline, quote },
      { interpreters },
    );

    const actions: Action[] = [];
    const skipApprove =
      opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]);
    if (tokenIn !== zeroAddress && !skipApprove && plan.approvalTarget) {
      actions.push(
        ...(await buildApprovalActions(
          module,
          tokenIn,
          owner,
          plan.approvalTarget,
          plan.approvalAmount ?? amountIn,
        )),
      );
    }
    return [...actions, ...plan.actions];
  },
});
