import type { BlockExpressionNode, TransactionAction } from "@evmcrispr/sdk";
import { type Action, defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Frames from "..";
import { frameMarkOf, markFrame } from "../marks";

export default defineCommand<Frames>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "A frame transaction is its own transaction; it cannot run inside a smart batch.",
  },
  name: "default",
  description:
    "Make every call of the block a DEFAULT frame of a frame transaction: called by the entry point, not by the sender. Only works inside `frames:tx`.",
  args: [
    {
      name: "block",
      type: "block",
      description: "Commands whose calls become DEFAULT frames",
    },
  ],
  async run(module, { block }, { interpreters }) {
    if (module.depth === 0)
      throw new ErrorException("default only works inside frames:tx");
    const actions =
      ((await interpreters.interpretNode(block as BlockExpressionNode, {
        batchContext: interpreters.batchContext,
      })) as Action[] | undefined) ?? [];
    const calls = actions.flatMap((action) =>
      "type" in action && action.type === "batched"
        ? action.actions
        : !("type" in action) || action.type === undefined
          ? [action as TransactionAction]
          : [],
    );
    // A verify is its own mode: marking it default would silently send it
    // as a call by the entry point.
    if (calls.some((call) => frameMarkOf(call)?.mode === "verify"))
      throw new ErrorException(
        "verify cannot go inside default: a VERIFY frame is its own mode, so write it outside the default block.",
      );
    // A check marked by post-verify stays one: default would make it a body
    // call by the entry point.
    if (calls.some((call) => frameMarkOf(call)?.mode === "postTx"))
      throw new ErrorException(
        "post-verify goes last in frames:tx, once: write it as the block's last statement, not inside a default block",
      );
    for (const call of calls) markFrame(call, { mode: "default" });
    return actions;
  },
});
