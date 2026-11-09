import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, withSender } from "@evmcrispr/sdk";
import { frameSidecarOf } from "@evmcrispr/viem-frames";
import type { Address } from "viem";
import type Frames from "..";
import { frameAction } from "../actions";
import { gasOption, layoutFrames, requireLimits } from "../layout";
import { frameNetwork } from "../networks";

export default defineCommand<Frames>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "A frame transaction is its own transaction; it cannot run inside a smart batch.",
  },
  name: "tx",
  description:
    "Send the calls of a block as one EIP-8141 frame transaction: a verify frame first, then one frame per call, `batch` groups atomic. Experimental: on the alt-mempool devnet and the local frame devnets.",
  args: [
    {
      name: "block",
      type: "block",
      description:
        "The transaction's frames in order: `exec`, `batch`, `default` and `verify`",
    },
  ],
  opts: [
    {
      name: "account",
      type: "address",
      description:
        "Frame account the wallet signs for: it becomes the sender, and its checks are called",
    },
    {
      name: "paymaster",
      type: "address",
      description: "Account that pays for the transaction",
    },
    {
      name: "paymaster-data",
      type: "bytes",
      description: "Data of the paymaster's pay frame",
    },
    {
      name: "state-gas",
      type: "number",
      description: "State gas limit of every body frame (200000 by default)",
    },
    {
      name: "mempool",
      type: "string",
      description:
        "`alt` or `canonical`; by default `alt` where the network has an alt mempool, else `canonical`",
    },
  ],
  batchable: false,
  async run(module, { block }, { opts, interpreters }) {
    // The default is the network's: the alt mempool where it has one.
    const network = frameNetwork(await module.getChainId());
    const mempool =
      opts.mempool ??
      (network && !frameSidecarOf(network.chain) ? "canonical" : "alt");
    if (mempool !== "alt" && mempool !== "canonical")
      throw new ErrorException(
        `--mempool is alt or canonical, not ${mempool}.`,
      );
    if (module.depth > 0)
      throw new ErrorException(
        "frames:tx cannot be nested in another frames:tx",
      );
    const stateGas =
      opts["state-gas"] === undefined
        ? undefined
        : gasOption(opts["state-gas"], "--state-gas");

    const account = opts.account as Address | undefined;
    const run = async () =>
      ((await interpreters.interpretNode(block as BlockExpressionNode, {
        batchContext: interpreters.batchContext,
      })) as Action[] | undefined) ?? [];

    module.depth++;
    let actions: Action[];
    try {
      // The enclosing batch context, if any, is passed on as `eez:on` does:
      // the block's actions come back and nothing in it is sent on its own.
      actions = account ? await withSender(module, account, run) : await run();
    } finally {
      module.depth--;
    }
    if (actions.length === 0) return [];

    const sender = account ?? (await module.getSender());
    const chainId = await module.getChainId();
    const frames = layoutFrames({
      actions,
      sender,
      chainId,
      paymaster: opts.paymaster,
      paymasterData: opts["paymaster-data"],
      stateGas,
      accountChecks: account !== undefined,
    });
    // A frame account's transaction is signed once, exactly as sent, so
    // nothing sizes its frames: each one must carry its limits. A plain
    // sender's are checked when it is sent (nothing sizes them yet either).
    if (account) requireLimits(frames);
    return [
      frameAction.create({
        chainId,
        from: sender,
        data: {
          frames,
          mempool,
          ...(account && {
            account: {
              kind: "frame-account",
              owner: await module.getConnectedAccount(),
            },
          }),
        },
      }),
    ];
  },
});
