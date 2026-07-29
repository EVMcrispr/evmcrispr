import { defineHelper } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { ownableAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "pendingOwner",
  batchable: false,
  description:
    "Pending owner of an Ownable2Step contract (the zero address when no transfer is in progress).",
  returnType: "address",
  args: [
    {
      name: "contract",
      type: "address",
      description: "Ownable2Step contract address",
    },
  ],
  async run(module, { contract }) {
    const client = await module.getClient();
    return client.readContract({
      address: contract,
      abi: ownableAbi,
      functionName: "pendingOwner",
    });
  },
});
