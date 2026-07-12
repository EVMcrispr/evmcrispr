import { defineHelper, Num } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { accessManagerAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "operationSchedule",
  batchable: false,
  description:
    "Timestamp at which a scheduled AccessManager operation becomes executable (0 when unset, expired or already executed).",
  returnType: "number",
  args: [
    { name: "manager", type: "address", description: "AccessManager address" },
    {
      name: "operationId",
      type: "bytes32",
      description: "Operation id from @access-control:operationId",
    },
  ],
  async run(module, { manager, operationId }) {
    const client = await module.getClient();
    const timestamp = await client.readContract({
      address: manager,
      abi: accessManagerAbi,
      functionName: "getSchedule",
      args: [operationId],
    });
    return Num.fromBigInt(BigInt(timestamp));
  },
});
