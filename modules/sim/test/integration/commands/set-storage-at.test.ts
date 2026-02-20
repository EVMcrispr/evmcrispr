import "../../setup";
import { describeCommand, expect, getPublicClient } from "@evmcrispr/test-utils";

const addr = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";
const slot =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const value =
  "0x00000000000000000000000000000000000000000000000000000000000000ff";

describeCommand("set-storage-at", {
  describeName: "Sim > commands > set-storage-at <address> <slot> <value>",
  module: "sim",
  preamble: "load sim",
  errorCases: [
    {
      name: "should fail when used outside a fork block",
      script: `sim:set-storage-at ${addr} ${slot} ${value}`,
      error: "set-storage-at can only be used inside a fork block",
    },
  ],
});

describeCommand("set-storage-at", {
  describeName: "Sim > commands > set-storage-at > action generation",
  cases: [
    {
      name: "should set storage inside a fork block",
      script: `load sim\nsim:fork --using anvil (\n  sim:set-storage-at ${addr} ${slot} ${value}\n)`,
      validate: async () => {
        const client = getPublicClient();
        const storedValue = await client.getStorageAt({ address: addr, slot });
        expect(storedValue).to.equal(value);
      },
    },
  ],
});
