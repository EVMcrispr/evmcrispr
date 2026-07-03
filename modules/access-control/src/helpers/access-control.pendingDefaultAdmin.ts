import { defineHelper } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { defaultAdminRulesAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "access-control.pendingDefaultAdmin",
  batchable: false,
  description:
    "Pending default admin of an AccessControlDefaultAdminRules contract (the zero address when no transfer is in progress).",
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
});
