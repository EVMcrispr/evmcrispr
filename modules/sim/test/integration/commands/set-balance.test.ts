import "../../setup";
import { describeCommand, expect, getPublicClient } from "@evmcrispr/test-utils";

const addr = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";

describeCommand("set-balance", {
  describeName: "Sim > commands > set-balance <address> <amount>",
  module: "sim",
  preamble: "load sim",
  errorCases: [
    {
      name: "should fail when used outside a fork block",
      script: `sim:set-balance ${addr} 100e18`,
      error: "set-balance can only be used inside a fork block",
    },
  ],
});

describeCommand("set-balance", {
  describeName: "Sim > commands > set-balance > action generation",
  cases: [
    {
      name: "should generate correct RPC action inside a fork block",
      script: `load sim\nsim:fork --using anvil (\n  sim:set-balance ${addr} 100e18\n)`,
      validate: async () => {
        const client = getPublicClient();
        const balance = await client.getBalance({ address: addr });
        expect(Number(balance)).to.be.greaterThan(0);
      },
    },
  ],
});
