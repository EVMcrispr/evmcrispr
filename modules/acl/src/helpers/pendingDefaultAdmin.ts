import { defineHelper } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress } from "viem";
import type AccessControl from "..";
import { defaultAdminRulesAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "pendingDefaultAdmin",
  batchable: false,
  description:
    "Pending default admin of an AccessControlDefaultAdminRules contract (the zero address when no transfer is in progress).",
  compileDescription:
    "Reads the pending admin of the pair, not the accept schedule.",
  returnType: "address",
  args: [
    {
      name: "contract",
      type: "address",
      description: "AccessControlDefaultAdminRules contract address",
    },
  ],
  async run(module, { contract }) {
    const client = await module.getClient();
    const [newAdmin] = await client.readContract({
      address: contract,
      abi: defaultAdminRulesAbi,
      functionName: "pendingDefaultAdmin",
    });
    return newAdmin;
  },
  compile: async (ctx, node) => {
    const contract = await ctx.interpreters.interpretNode(node.args[0]);
    // (newAdmin, acceptSchedule): the pending admin is word 0.
    return directReadOperand(
      ctx,
      getAddress(String(contract)),
      encodeFunctionData({
        abi: defaultAdminRulesAbi,
        functionName: "pendingDefaultAdmin",
      }),
      "Address",
      0n,
    );
  },
});
