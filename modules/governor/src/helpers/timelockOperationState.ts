import { defineHelper } from "@evmcrispr/sdk";
import type Governor from "..";
import { timelockAbi } from "../utils";

export default defineHelper<Governor>({
  name: "timelockOperationState",
  batchable: false,
  description:
    "State of a TimelockController operation: Unset, Waiting, Ready or Done.",
  returnType: "string",
  args: [
    {
      name: "timelock",
      type: "address",
      description: "TimelockController address",
    },
    {
      name: "operationId",
      type: "bytes32",
      description: "Operation id (bound by governor:timelock-schedule)",
    },
  ],
  async run(module, { timelock, operationId }) {
    const client = await module.getClient();
    // getTimestamp encodes the state: 0 = unset, 1 = done, else the ETA
    const timestamp = await client.readContract({
      address: timelock,
      abi: timelockAbi,
      functionName: "getTimestamp",
      args: [operationId],
    });
    if (timestamp === 0n) return "Unset";
    if (timestamp === 1n) return "Done";
    const block = await client.getBlock();
    return timestamp <= block.timestamp ? "Ready" : "Waiting";
  },
});
