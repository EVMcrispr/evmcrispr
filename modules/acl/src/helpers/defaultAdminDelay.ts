import { defineHelper, Num } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { defaultAdminRulesAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "defaultAdminDelay",
  batchable: false,
  description:
    "Delay in seconds applied to default admin transfers of an AccessControlDefaultAdminRules contract.",
  returnType: "number",
  args: [
    {
      name: "contract",
      type: "address",
      description: "AccessControlDefaultAdminRules contract address",
    },
  ],
  async run(module, { contract }) {
    const client = await module.getClient();
    const delay = await client.readContract({
      address: contract,
      abi: defaultAdminRulesAbi,
      functionName: "defaultAdminDelay",
    });
    return Num.fromBigInt(BigInt(delay));
  },
});
