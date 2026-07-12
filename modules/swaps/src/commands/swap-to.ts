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
import { applySlippageUp, pctToBps } from "../utils/amounts";
import { buildApprovalActions } from "../utils/approval";
import { resolveDeadline } from "../utils/deadline";
import { sameAddress } from "../utils/tokens";
import { resolveVenue } from "../venues/registry";
import type { Quote } from "../venues/types";

const DEFAULT_SLIPPAGE_PCT = 0.5;

export default defineCommand<Swaps>({
  name: "swap-to",
  description:
    "Buy an exact amount of a token, spending as little as possible of another. The input is capped by --max, or --slippage applied to a quote (default 0.5%). Unspent input is refunded by the venue.",
  args: [
    {
      name: "amountOut",
      type: "number",
      description: "Exact amount of tokenOut to buy, in base units (wei)",
    },
    { name: "tokenOut", type: "address", description: "Token to buy" },
    { name: "from", type: "command", description: "Keyword `from`" },
    {
      name: "tokenIn",
      type: "address",
      description:
        "Token to spend (use @token(SYM); the native token resolves to the zero address)",
    },
  ],
  opts: [
    {
      name: "max",
      type: "number",
      description: "Maximum input in base units (overrides --slippage)",
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
        "Venue to swap on (default: the best venue available on the chain)",
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
    from: () => [fieldItem("from")],
  },
  batchable: (_args, opts) =>
    String(opts.using ?? "").toLowerCase() !== "cowswap" ||
    "CoWSwap signs and posts an off-chain order and cannot run inside a batch",
  async run(
    module,
    { amountOut, tokenOut, from, tokenIn },
    { opts, interpreters },
  ) {
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
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

    const amount = Num(amountOut).toBigInt();
    if (amount <= 0n) {
      throw new ErrorException("<amountOut> must be greater than zero");
    }

    const owner = await module.getConnectedAccount(true);
    const recipient = opts.to ?? owner;
    const venue = await resolveVenue(module, opts.using, { exactOut: true });
    if (interpreters.batchContext && venue.kind === "intent") {
      throw new ErrorException(
        `${venue.name} signs and posts an off-chain order and cannot run inside a ${interpreters.batchContext.name}`,
      );
    }

    const quoteReq = {
      chainId,
      tokenIn,
      tokenOut,
      amount,
      kind: "exactOut" as const,
      from: owner,
    };
    const slippageBps = pctToBps(
      opts.slippage !== undefined
        ? Num(opts.slippage).toNumber()
        : DEFAULT_SLIPPAGE_PCT,
    );

    let limit: bigint;
    let quote: Quote | undefined;
    if (opts.max !== undefined) {
      limit = Num(opts.max).toBigInt();
    } else {
      if (interpreters.batchContext?.hasActions) {
        throw new ErrorException(
          `the quote backing --slippage runs at batch-build time and cannot observe earlier actions in the same ${interpreters.batchContext.name}; pass an explicit --max bound instead`,
        );
      }
      quote = await venue.quote(module, quoteReq);
      limit = applySlippageUp(quote.amountIn, slippageBps);
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
          plan.approvalAmount ?? limit,
        )),
      );
    }
    return [...actions, ...plan.actions];
  },
});
