import type { BlockExpressionNode } from "@evmcrispr/sdk";
import { type Action, defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Frame from "..";
import { markFrame } from "../marks";

export default defineCommand<Frame>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "A frame transaction is its own transaction; it cannot run inside a smart batch.",
  },
  name: "default",
  description:
    "Make every call of the block a DEFAULT frame of a frame transaction: called by the entry point, not by the sender. Only works inside `frame:tx`.",
  args: [
    {
      name: "block",
      type: "block",
      description: "Commands whose calls become DEFAULT frames",
    },
  ],
  async run(module, { block }, { interpreters }) {
    if (module.depth === 0)
      throw new ErrorException("default only works inside frame:tx");
    const actions =
      ((await interpreters.interpretNode(block as BlockExpressionNode, {
        batchContext: interpreters.batchContext,
      })) as Action[] | undefined) ?? [];
    for (const action of actions) {
      if ("type" in action && action.type === "batched") {
        for (const inner of action.actions)
          markFrame(inner, { mode: "default" });
      } else if (!("type" in action) || action.type === undefined) {
        markFrame(action as never, { mode: "default" });
      }
    }
    return actions;
  },
});
