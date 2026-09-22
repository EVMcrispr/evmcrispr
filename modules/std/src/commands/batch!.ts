import { type BlockExpressionNode, defineCommand } from "@evmcrispr/sdk";
import { compileSmartBatch } from "@evmcrispr/sdk/onchain";
import type Std from "..";

export default defineCommand<Std>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "batch!",
  description:
    "Execute an atomic smart batch with explicit on-chain values and return capture from a compatible smart account.",
  args: [{ name: "block", type: "block", description: "Commands to compile" }],
  opts: [
    {
      name: "salt",
      type: "bytes32",
      description:
        "Output-storage salt; reuse only to reproduce the same signed plan",
    },
  ],
  batchable: false,
  createsBatchContext: true,
  createsSmartBatchContext: true,
  async run(module, { block }, { opts, interpreters }) {
    const account = await module.getSender();
    const plan = await compileSmartBatch(
      module,
      block as BlockExpressionNode,
      interpreters,
      { name: "batch!", account, route: "executor", salt: opts.salt },
    );
    return plan.steps.length
      ? [{ type: "smartBatch", chainId: plan.chainId, from: account, plan }]
      : [];
  },
});
