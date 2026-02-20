import "../../setup";
import { describeCommand, expect, getPublicClient } from "@evmcrispr/test-utils";

describeCommand("wait", {
  describeName: "Sim > commands > wait <duration> [period]",
  module: "sim",
  preamble: "load sim",
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
      setup: async (client) => {
        const block = await client.getBlock();
        return { timestampBefore: block.timestamp };
      },
      validate: async (_actions, _interpreter, setupData) => {
        const client = getPublicClient();
        const blockAfter = await client.getBlock();
        const timeDiff = blockAfter.timestamp - setupData.timestampBefore;
        expect(Number(timeDiff)).to.be.greaterThanOrEqual(3600);
      },
    },
  ],
});
