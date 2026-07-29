import "../../setup";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("fork", {
  describeName: "Sim > commands > fork > wait time advancement",
  module: "sim",
  docCases: [
    {
      description: "Advance time by 1 hour inside a fork",
      code: `sim:fork --using anvil (\n  wait 3600\n)`,
      preamble: "load sim",
    },
  ],
  cases: [
    {
      name: "should warp fork time on a wait terminal action",
      script: "load sim\nsim:fork --using anvil (\n  wait 3600\n)",
      validate: async () => {
        const client = getPublicClient();
        const latest = await client.getBlock();
        const prev = await client.getBlock({
          blockNumber: latest.number - 1n,
        });
        const timeDiff = latest.timestamp - prev.timestamp;
        expect(Number(timeDiff)).to.be.greaterThanOrEqual(3600);
      },
    },
  ],
});
