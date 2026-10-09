import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem } from "viem";
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
      description: "Operation id from @acl:operationId",
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
  compile: async (ctx, node) =>
    callReadOperand(
      ctx,
      await readTarget(ctx, "operationSchedule!", node.args[0]),
      getAbiItem({ abi: accessManagerAbi, name: "getSchedule" }) as AbiFunction,
      [node.args[1]],
      "Uint",
    ),
});
