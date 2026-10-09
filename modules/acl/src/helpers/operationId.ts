import { defineHelper, encodeSignatureCall } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type AccessControl from "..";
import { accessManagerAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "operationId",
  batchable: false,
  description:
    "Operation id of an AccessManager call (hashOperation of caller, target and calldata), for use with @acl:operationSchedule.",
  returnType: "bytes32",
  args: [
    { name: "manager", type: "address", description: "AccessManager address" },
    {
      name: "caller",
      type: "address",
      description: "Account that schedules the operation",
    },
    {
      name: "target",
      type: "address",
      description: "Managed contract address",
    },
    {
      name: "signature",
      type: "string",
      description: "Function signature (e.g. mint(address,uint256))",
    },
    {
      name: "params",
      type: "array",
      description: "Arguments matching the signature types",
      optional: true,
    },
  ],
  async run(module, { manager, caller, target, signature, params }) {
    const client = await module.getClient();
    return client.readContract({
      address: manager,
      abi: accessManagerAbi,
      functionName: "hashOperation",
      args: [caller, target, encodeSignatureCall(signature, params ?? [])],
    });
  },
  compile: async (ctx, node) => {
    // The call being hashed is encoded when the script is built; the
    // manager, the caller and the target may be live.
    const signature = await ctx.interpreters.interpretNode(node.args[3]);
    const params = node.args[4]
      ? await ctx.interpreters.interpretNode(node.args[4])
      : undefined;
    return callReadOperand(
      ctx,
      await readTarget(ctx, "operationId!", node.args[0]),
      getAbiItem({
        abi: accessManagerAbi,
        name: "hashOperation",
      }) as AbiFunction,
      [
        node.args[1],
        node.args[2],
        {
          value: encodeSignatureCall(
            String(signature),
            (params as never[]) ?? [],
          ),
        },
      ],
      "Bytes32",
    );
  },
});
