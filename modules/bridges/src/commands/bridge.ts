import type { Action } from "@evmcrispr/sdk";
import {
  coerceBoolean,
  defineCommand,
  ErrorException,
  Num,
} from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import type Bridges from "..";
import { resolveAdapter } from "../adapters/registry";
import type { BridgeFeeQuote } from "../adapters/types";
import { resolveChainId } from "../argTypes";
import { buildApprovalActions } from "../utils/approval";
import { registerSimRelayHandler } from "../utils/sim";

export default defineCommand<Bridges>({
  name: "bridge",
  description:
    "Send tokens from the current chain to another chain, approving the bridge automatically when needed. The adapter defaults to CCTPv2 for native USDC, Across for other tokens, and the canonical bridge between an L2 and mainnet.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount to bridge, in base units (wei)",
    },
    {
      name: "token",
      type: "address",
      description:
        "Token to bridge (use @token(SYM); the native token resolves to the zero address)",
    },
    {
      name: "destChain",
      type: "chain",
      description: "Destination chain name or id (e.g. optimism, base, 8453)",
    },
  ],
  opts: [
    {
      name: "to",
      type: "address",
      description:
        "Recipient on the destination chain (defaults to the connected account)",
    },
    {
      name: "using",
      type: "bridge-adapter",
      description:
        "Adapter: CCTPv2, Across, NativeBridge, LayerZero or CCIP (default: the best adapter for the token and lane)",
    },
    {
      name: "max-fee",
      type: "number",
      description:
        "Abort when the bridge fee, in base units of <token>, exceeds this bound",
    },
    {
      name: "remote-token",
      type: "address",
      description:
        "Destination-chain address of <token> (NativeBridge ERC-20 transfers only)",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
    },
  ],
  batchable: true,
  async run(module, { amount, token, destChain }, { opts, interpreters }) {
    const srcChainId = await module.getChainId();
    const dstChainId = resolveChainId(destChain);
    if (srcChainId === dstChainId) {
      throw new ErrorException(
        `already on chain ${srcChainId}; there is nothing to bridge`,
      );
    }

    const amountIn = Num(amount).toBigInt();
    if (amountIn <= 0n) {
      throw new ErrorException("<amount> must be greater than zero");
    }

    const owner = await module.getConnectedAccount(true);
    const recipient = opts.to ?? owner;
    const adapter = await resolveAdapter(module, opts.using, {
      srcChainId,
      dstChainId,
      token,
    });

    const req = {
      srcChainId,
      dstChainId,
      token,
      amount: amountIn,
      from: owner,
      recipient,
    };

    if (interpreters.batchContext?.hasActions && adapter.kind === "api") {
      throw new ErrorException(
        `${adapter.name} quotes its fee at batch-build time and cannot observe earlier actions in the same ${interpreters.batchContext.name}; bridge outside the batch`,
      );
    }

    let quote: BridgeFeeQuote | undefined;
    if (!interpreters.batchContext?.hasActions) {
      quote = await adapter.quote(module, req);
      if (opts["max-fee"] !== undefined) {
        const maxFee = Num(opts["max-fee"]).toBigInt();
        if (quote.tokenFee > maxFee) {
          throw new ErrorException(
            `${adapter.name} charges ${quote.tokenFee} but --max-fee is ${maxFee}`,
          );
        }
      }
    }

    const plan = await adapter.buildBridge(
      module,
      { ...req, quote },
      { interpreters, opts },
    );

    const actions: Action[] = [];
    const skipApprove =
      opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]);
    // An OFT adapter escrows the underlying ERC-20, so the plan may name a
    // different token to approve than the one being bridged.
    const approvalToken = plan.approvalToken ?? token;
    if (approvalToken !== zeroAddress && !skipApprove && plan.approvalTarget) {
      actions.push(
        ...(await buildApprovalActions(
          module,
          approvalToken,
          owner,
          plan.approvalTarget,
          plan.approvalAmount ?? amountIn,
        )),
      );
    }

    // Inside a simulation, teach sim how to deliver this transfer's
    // destination leg when the script switches to the destination chain.
    if (adapter.relayHandler) {
      registerSimRelayHandler(module, adapter.relayHandler as any);
    }

    module.context.log(
      `Bridging ${amountIn} of ${token} to chain ${dstChainId} with ${adapter.name}. ` +
        `Track it with @bridges:status(<source-tx-hash>)` +
        (adapter.requiresClaim(srcChainId, dstChainId)
          ? `, then finalize it on the destination chain with bridges:claim <source-tx-hash>.`
          : "."),
    );

    return [...actions, ...plan.actions];
  },
});
