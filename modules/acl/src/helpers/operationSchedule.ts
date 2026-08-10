import { defineHelper, Num } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress } from "viem";
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
  compile: async (ctx, node) => {
    const [manager, operationId] = await Promise.all(
      node.args.map((n) => ctx.interpreters.interpretNode(n)),
    );
    return directReadOperand(
      ctx,
      getAddress(String(manager)),
      encodeFunctionData({
        abi: accessManagerAbi,
        functionName: "getSchedule",
        args: [operationId as `0x${string}`],
      }),
      "Uint",
    );
  },
});
