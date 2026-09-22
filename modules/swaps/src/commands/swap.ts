import type { Action } from "@evmcrispr/sdk";
import {
  coerceBoolean,
  defineCommand,
  ErrorException,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import {
  getSmartCompileContext,
  isRuntimeValue,
  positiveRuntimeAmount,
  type SmartAmount,
} from "@evmcrispr/sdk/onchain";
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
  smartSupport: { kind: "runtime" },
  name: "swap",
  primaryCall: -1,
  description:
    "Sell an exact amount of one token for another on a DEX or aggregator, approving the venue automatically when needed. Slippage protection comes from --min, or --slippage applied to a quote (default 0.5%).",
  args: [
    {
      name: "amount",
      runtime: true,
      snapshot: true,
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
      name: "fee",
      type: "number",
      description:
        "Explicit single-pool V3/V4 fee tier; required when a runtime amount cannot be quoted",
    },
    {
      name: "min",
      runtime: true,
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
        "Venue: Delora, UniswapV4, UniswapV3, UniswapV2, Honeyswap, SushiSwap, Balancer, or CoWSwap (default: the best venue available on the chain)",
    },
    {
      name: "to",
      type: "address",
      runtime: true,
      description:
        "Recipient of the output (defaults to the connected account)",
    },
    {
      name: "deadline",
      runtime: true,
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

    const amountIn = isRuntimeValue(amount)
      ? positiveRuntimeAmount(module, amount)
      : Num(amount).toBigInt();
    if (!isRuntimeValue(amountIn) && amountIn <= 0n) {
      throw new ErrorException("<amount> must be greater than zero");
    }

    const owner = await module.getSender();
    const recipient = opts.to ?? owner;
    const venue = await resolveVenue(module, opts.using);
    if (interpreters.batchContext && venue.kind === "intent") {
      throw new ErrorException(
        `${venue.name} signs and posts an off-chain order and cannot run inside a ${interpreters.batchContext.name}`,
      );
    }

    if (
      venue.kind !== "onchain" &&
      (isRuntimeValue(amountIn) ||
        isRuntimeValue(recipient) ||
        isRuntimeValue(opts.min))
    )
      throw new ErrorException(
        `${venue.name} requires build-time amount, bounds, and recipient for its external quote`,
      );
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

    let limit: SmartAmount;
    let quote: Quote | undefined;
    if (opts.min !== undefined) {
      limit = isRuntimeValue(opts.min) ? opts.min : Num(opts.min).toBigInt();
      if (isRuntimeValue(limit))
        limit = await interpreters.batchContext!.smartState!.snapshot(
          getSmartCompileContext(module)!,
          limit,
        );
    } else {
      if (isRuntimeValue(amountIn) || interpreters.batchContext?.hasActions) {
        throw new ErrorException(
          `the quote backing --slippage runs at batch-build time and cannot observe earlier actions in the same ${interpreters.batchContext?.name ?? "smart batch"}; pass an explicit --min bound instead`,
        );
      }
      quote = await venue.quote(module, {
        ...quoteReq,
        amount: amountIn as bigint,
      });
      limit = applySlippageDown(quote.amountOut, slippageBps);
    }

    const deadline = await resolveDeadline(module, opts);
    const plan = await venue.buildSwap(
      module,
      {
        ...quoteReq,
        limit,
        slippageBps,
        recipient,
        deadline,
        skipApproval:
          opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]),
        quote,
        fee: opts.fee === undefined ? undefined : Number(opts.fee),
      },
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
