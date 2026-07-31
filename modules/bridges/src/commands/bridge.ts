import type { Action } from "@evmcrispr/sdk";
import {
  chainLabel,
  coerceBoolean,
  defineCommand,
  ErrorException,
  fieldItem,
  Num,
  tokenAmountFormatter,
} from "@evmcrispr/sdk";
import { parseAbiItem, zeroAddress } from "viem";
import type Bridges from "..";
import { resolveAdapter } from "../adapters/registry";
import type { BridgeFeeQuote } from "../adapters/types";
import { resolveChainId } from "../argTypes";
import { buildApprovalActions } from "../utils/approval";
import { registerSimRelayHandler } from "../utils/sim";

const balanceOfAbi = parseAbiItem(
  "function balanceOf(address owner) view returns (uint256)",
);

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
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "destChain",
      type: "chain",
      description: "Destination chain name or id (e.g. optimism, base, 8453)",
    },
  ],
  opts: [
    {
      name: "receiver",
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
  completions: { to: () => [fieldItem("to")] },
  async run(module, { amount, token, to, destChain }, { opts, interpreters }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const srcChainId = await module.getChainId();
    const dstChainId = resolveChainId(destChain);
    if (srcChainId === dstChainId) {
      throw new ErrorException(
        `already on ${chainLabel(srcChainId)}; there is nothing to bridge`,
      );
    }

    const amountIn = Num(amount).toBigInt();
    if (amountIn <= 0n) {
      throw new ErrorException("<amount> must be greater than zero");
    }

    const owner = await module.getConnectedAccount(true);
    const recipient = opts.receiver ?? owner;

    // Pre-check the sender's balance so a doomed bridge fails with a real
    // message instead of a bare on-chain revert. The read reflects already
    // executed state only, so it is authoritative inside sim:fork (actions
    // run as they are produced) but possibly stale when earlier actions in
    // the script or batch are meant to fund the account — warn, don't block.
    const client = await module.getClient();
    // Advisory only: <token> may not expose balanceOf (e.g. an OFT wrapper),
    // so an unreadable balance skips the check instead of failing the command.
    const balance = await (token === zeroAddress
      ? client.getBalance({ address: owner })
      : client.readContract({
          address: token,
          abi: [balanceOfAbi],
          functionName: "balanceOf",
          args: [owner],
        })
    ).catch(() => undefined);
    // Symbol + human units for logs and errors; falls back to raw base
    // units + address when the token's metadata is unreadable.
    const fmt = await tokenAmountFormatter(module, token);
    if (balance !== undefined && balance < amountIn) {
      const shortfall =
        `account ${owner} holds ${fmt(balance)} on ` +
        `${chainLabel(srcChainId)}, less than the ${fmt(amountIn)} being bridged`;
      if (interpreters.simulation && !interpreters.batchContext?.hasActions) {
        throw new ErrorException(shortfall);
      }
      module.context.log(
        `⚠ ${shortfall}; unless earlier actions fund it, the bridge will revert`,
      );
    }

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
            `${adapter.name} charges ${fmt(quote.tokenFee)} but --max-fee is ${fmt(maxFee)}`,
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
      `Bridging ${fmt(amountIn)} to ${chainLabel(dstChainId)} with ${adapter.name}. ` +
        `Track it with @bridges:status(<source-tx-hash>)` +
        (adapter.requiresClaim(srcChainId, dstChainId)
          ? `, then finalize it on the destination chain with bridges:claim <source-tx-hash>.`
          : "."),
    );

    return [...actions, ...plan.actions];
  },
});
