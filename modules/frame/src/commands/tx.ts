import type { Action, BlockExpressionNode, FrameAction } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Frame from "..";
import { layoutFrames } from "../layout";

export default defineCommand<Frame>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "A frame transaction is its own transaction; it cannot run inside a smart batch.",
  },
  name: "tx",
  description:
    "Send the calls of a block as one EIP-8141 frame transaction: a verify frame first, then one frame per call, `batch` groups atomic. Experimental: the alt-mempool devnet only.",
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
      description: "State gas limit of every body frame",
    },
    {
      name: "mempool",
      type: "string",
      description: "`alt` (default) or `canonical`",
    },
  ],
  batchable: false,
  async run(module, { block }, { opts, interpreters }) {
    const mempool = opts.mempool ?? "alt";
    if (mempool !== "alt" && mempool !== "canonical")
      throw new ErrorException(
        `--mempool is alt or canonical, not ${mempool}.`,
      );
    if (module.depth > 0)
      throw new ErrorException("frame:tx cannot be nested in another frame:tx");

    module.depth++;
    let actions: Action[];
    try {
      // The enclosing batch context, if any, is passed on as `eez:on` does:
      // the block's actions come back and nothing in it is sent on its own.
      actions =
        ((await interpreters.interpretNode(block as BlockExpressionNode, {
          batchContext: interpreters.batchContext,
        })) as Action[] | undefined) ?? [];
    } finally {
      module.depth--;
    }
    if (actions.length === 0) return [];

    const sender = await module.getSender();
    const chainId = await module.getChainId();
    const frames = layoutFrames({
      actions,
      sender,
      chainId,
      paymaster: opts.paymaster,
      paymasterData: opts["paymaster-data"],
      stateGas:
        opts["state-gas"] === undefined ? undefined : BigInt(opts["state-gas"]),
    });
    const action: FrameAction = {
      type: "frame",
      chainId,
      from: sender,
      frames,
      mempool,
    };
    return [action];
  },
});
