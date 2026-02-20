import "../../setup";
import { describeCommand, expect, getPublicClient } from "@evmcrispr/test-utils";

const addr = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";
const bytecode = "0x600160005260206000f3";

describeCommand("set-code", {
  describeName: "Sim > commands > set-code <address> <bytecode>",
  module: "sim",
  preamble: "load sim",
  errorCases: [
    {
      name: "should fail when used outside a fork block",
      script: `sim:set-code ${addr} ${bytecode}`,
      error: "set-code can only be used inside a fork block",
    },
  ],
});

describeCommand("set-code", {
  describeName: "Sim > commands > set-code > action generation",
  cases: [
    {
      name: "should set contract code inside a fork block",
      script: `load sim\nsim:fork --using anvil (\n  sim:set-code ${addr} ${bytecode}\n)`,
      validate: async () => {
        const client = getPublicClient();
        const code = await client.getCode({ address: addr });
        expect(code).to.not.equal("0x");
        expect(code!.length).to.be.greaterThan(2);
      },
    },
  ],
});
