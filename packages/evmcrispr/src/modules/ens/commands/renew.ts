import { parseAbi } from "viem";

import { defineCommand, encodeAction } from "../../../utils";

import type { Ens } from "../Ens";

const bulkRenewal = "0xfF252725f6122A92551A5FA9a6b6bf10eb0Be035";

export const renew = defineCommand<Ens>({
  args: [
    { name: "domains", type: "any" },
    { name: "duration", type: "any" },
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
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
});
