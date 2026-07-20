import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import { parseAbi } from "viem";

import type Ens from "..";

const bulkRenewal = "0xa12159e5131b1eEf6B4857EEE3e1954744b5033A";

export default defineCommand<Ens>({
  name: "renew",
  description: "Renew ENS domain registrations via bulk renewal.",
  args: [
    {
      name: "domains",
      type: "any",
      description: "ENS label(s) or names to renew",
    },
    {
      name: "duration",
      type: "any",
      description: "Renewal duration, in time units (e.g. 1y)",
    },
  ],
  async run(module, { domains, duration }) {
    if ((await module.getChainId()) !== 1) {
      throw Error("This command only works on mainnet");
    }

    const client = await module.getClient();

    const value = await client.readContract({
      address: bulkRenewal,
      abi: parseAbi([
        "function rentPrice(string[] calldata names, uint duration) external view returns(uint total)",
      ]),
      functionName: "rentPrice",
      args: [domains, duration],
    });

    return [
      {
        ...encodeAction(bulkRenewal, "renewAll(string[],uint256)", [
          domains,
          duration,
        ]),
        value,
      },
    ];
  },
});
