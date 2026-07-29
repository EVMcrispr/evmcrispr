import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import { parseAbi } from "viem";

import type Ens from "..";
import { eth2LDLabel } from "../utils";

const bulkRenewal = "0xa12159e5131b1eEf6B4857EEE3e1954744b5033A";

export default defineCommand<Ens>({
  name: "renew",
  description: "Renew ENS domain registrations via bulk renewal.",
  args: [
    {
      name: "domains",
      type: ["string", "array"],
      description: "ENS label(s) or names to renew",
    },
    {
      name: "duration",
      type: "number",
      description: "Renewal duration, in time units (e.g. 1y)",
    },
  ],
  async run(module, { domains, duration }) {
    if ((await module.getChainId()) !== 1) {
      throw Error("This command only works on mainnet");
    }

    const labels = (Array.isArray(domains) ? domains : [domains]).map(
      (name: string) => (name.includes(".") ? eth2LDLabel(name) : name),
    );

    const client = await module.getClient();

    const value = await client.readContract({
      address: bulkRenewal,
      abi: parseAbi([
        "function rentPrice(string[] calldata names, uint duration) external view returns(uint total)",
      ]),
      functionName: "rentPrice",
      args: [labels, BigInt(duration)],
    });

    return [
      {
        ...encodeAction(bulkRenewal, "renewAll(string[],uint256)", [
          labels,
          duration,
        ]),
        value,
      },
    ];
  },
});
