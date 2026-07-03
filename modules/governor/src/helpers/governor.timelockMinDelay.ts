import { defineHelper, Num } from "@evmcrispr/sdk";
import type Governor from "..";
import { timelockAbi } from "../utils";

export default defineHelper<Governor>({
  name: "governor.timelockMinDelay",
  batchable: false,
  description:
    "Minimum delay in seconds a TimelockController enforces on new operations.",
  returnType: "number",
  args: [
    {
      name: "timelock",
      type: "address",
      description: "TimelockController address",
    },
  ],
  async run(module, { timelock }) {
    const client = await module.getClient();
    const minDelay = await client.readContract({
      address: timelock,
      abi: timelockAbi,
      functionName: "getMinDelay",
    });
    return Num.fromBigInt(minDelay);
  },
});
