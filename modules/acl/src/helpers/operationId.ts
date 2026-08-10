import { defineHelper, encodeSignatureCall } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress } from "viem";
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
    const [manager, caller, target, signature, params] = await Promise.all(
      node.args.map((n) => ctx.interpreters.interpretNode(n)),
    );
    return directReadOperand(
      ctx,
      getAddress(String(manager)),
      encodeFunctionData({
        abi: accessManagerAbi,
        functionName: "hashOperation",
        args: [
          getAddress(String(caller)),
          getAddress(String(target)),
          encodeSignatureCall(String(signature), (params as never[]) ?? []),
        ],
      }),
      "Bytes32",
    );
  },
});
