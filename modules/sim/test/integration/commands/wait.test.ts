import "../../setup";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("wait", {
  describeName: "Sim > commands > wait <duration> [period]",
  module: "sim",
  preamble: "load sim",
  docCases: [
    {
      description: "Advance time by 1 hour",
      code: `sim:fork --using anvil (\n  sim:wait 3600\n)`,
    },
  ],
  errorCases: [
    {
      name: "should fail when used outside a fork block",
      script: "sim:wait 3600",
      error: "wait can only be used inside a fork block",
    },
  ],
});

describeCommand("wait", {
  describeName: "Sim > commands > wait > time advancement",
  cases: [
    {
      name: "should advance time inside a fork block",
      script: "load sim\nsim:fork --using anvil (\n  sim:wait 3600\n)",
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
