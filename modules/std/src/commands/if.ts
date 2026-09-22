import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import {
  defaultCompileCtx,
  encodeCond,
  isRuntimeValue,
  rawParam,
  runtimeValue,
  smartValueParam,
  staticCallParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type Std from "..";

export default defineCommand<Std>({
  smartSupport: {
    kind: "runtime",
    reason:
      "Runtime conditions select calls on-chain; branch-local values stay inside the selected branch.",
  },
  name: "if",
  description:
    "Conditionally execute a block of commands, with an optional else block.",
  args: [
    {
      name: "condition",
      runtime: true,
      type: "bool",
      description: "Whether to execute the then block",
    },
    {
      name: "thenBlock",
      type: "block",
      description: "Commands when condition is true",
    },
    {
      name: "elseBlock",
      type: "block",
      description: "Commands when condition is false",
      optional: true,
    },
  ],
  async run(module, { condition, thenBlock, elseBlock }, { interpreters }) {
    const { interpretNode, actionCallback } = interpreters;
    const blockOpts = { actionCallback };

    if (isRuntimeValue(condition)) {
      const state = interpreters.batchContext!.smartState!;
      const ctx = defaultCompileCtx(module, interpreters);
      const predicate = await state.snapshot(
        ctx,
        runtimeValue(
          smartValueParam(ctx, { type: "bool" }, condition),
          { type: "bool" },
          condition.batchId,
        ),
      );
      interpreters.batchContext!.hasActions = true;
      const parent = state.condition;
      for (const [block, truth] of [
        [thenBlock, true],
        [elseBlock, false],
      ] as const) {
        if (!block) continue;
        let param = truth
          ? predicate.operand.param
          : staticCallParam(
              ctx.core,
              encodeCond(
                predicate.operand.param,
                rawParam(toWord(0n)),
                rawParam(toWord(1n)),
              ),
            );
        if (parent)
          param = staticCallParam(
            ctx.core,
            encodeCond(parent.operand.param, param, rawParam(toWord(0n))),
          );
        state.condition = runtimeValue(
          param,
          { type: "bool" },
          condition.batchId,
        );
        module.bindingsManager.enterScope();
        try {
          await interpretNode(block as BlockExpressionNode, blockOpts);
        } finally {
          module.bindingsManager.exitScope();
          state.condition = parent;
        }
      }
      return [];
    }

    if (condition) {
      return (await interpretNode(
        thenBlock as BlockExpressionNode,
        blockOpts,
      )) as Action[];
    }

    if (elseBlock) {
      return (await interpretNode(
        elseBlock as BlockExpressionNode,
        blockOpts,
      )) as Action[];
    }

    return [];
  },
});
