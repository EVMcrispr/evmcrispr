import { defineHelper } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem } from "viem";
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
  compile: async (ctx, node) =>
    callReadOperand(
      ctx,
      await readTarget(ctx, "pendingDefaultAdmin!", node.args[0]),
      getAbiItem({
        abi: defaultAdminRulesAbi,
        name: "pendingDefaultAdmin",
      }) as AbiFunction,
      [],
      "Address",
      // (newAdmin, acceptSchedule): the address is word 0.
      0n,
    ),
});
