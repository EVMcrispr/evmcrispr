import { defineHelper } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { defaultAdminRulesAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "access-control.defaultAdmin",
  batchable: false,
  description:
    "Current default admin of an AccessControlDefaultAdminRules contract.",
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
    return client.readContract({
      address: contract,
      abi: defaultAdminRulesAbi,
      functionName: "defaultAdmin",
    });
  },
});
