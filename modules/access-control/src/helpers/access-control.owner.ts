import { defineHelper } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { ownableAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "access-control.owner",
  batchable: false,
  description: "Current owner of an Ownable contract.",
  returnType: "address",
  args: [
    {
      name: "contract",
      type: "address",
      description: "Ownable contract address",
    },
  ],
  async run(module, { contract }) {
    const client = await module.getClient();
    return client.readContract({
      address: contract,
      abi: ownableAbi,
      functionName: "owner",
    });
  },
});
