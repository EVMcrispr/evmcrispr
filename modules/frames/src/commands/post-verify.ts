import type {
  Action,
  BlockExpressionNode,
  TransactionAction,
} from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Frames from "..";
import { markFrame } from "../marks";

/** The only commands a post-verify block holds. */
const CHECKS = new Set(["assert", "exec"]);

export default defineCommand<Frames>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "A frame transaction is its own transaction; it cannot run inside a smart batch.",
  },
  name: "post-verify",
  description:
    "Check, after every other frame of a frame transaction, what it did: each assert or exec of the block is a POST_TX frame, and if one fails the transaction's body is reverted. The last statement of `frames:tx`; only on networks that run POST_TX frames (the Hegota devnet).",
  args: [
    {
      name: "block",
      type: "block",
      description: "The checks: assert and exec lines only",
    },
  ],
  async run(module, { block }, { interpreters }) {
    if (module.depth === 0)
      throw new ErrorException("post-verify only works inside frames:tx");
    const body = (block as BlockExpressionNode).body;
    if (body.length === 0)
      throw new ErrorException("post-verify needs at least one assert or exec");
    for (const line of body)
      if (!CHECKS.has(line.name))
        throw new ErrorException(
          `only assert and exec go inside post-verify, not ${line.name}: each line is one check after everything else`,
        );
    const actions =
      ((await interpreters.interpretNode(block as BlockExpressionNode, {
        batchContext: interpreters.batchContext,
      })) as Action[] | undefined) ?? [];
    // Each line is one check, one frame: a failed one is named by its line.
    const lines = actions.length === body.length;
    actions.forEach((action, i) =>
      markFrame(action as TransactionAction, {
        mode: "postTx",
        line: lines ? body[i]!.loc?.start.line : undefined,
      }),
    );
    return actions;
  },
});
