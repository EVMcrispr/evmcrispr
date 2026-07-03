import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "transfer-ownership",
  description:
    "Transfer ownership of an Ownable contract. On Ownable2Step contracts this stages the pending owner, who must then accept.",
  args: [
    {
      name: "contract",
      type: "address",
      description: "Ownable contract address",
    },
    { name: "newOwner", type: "address", description: "New owner address" },
  ],
  async run(_module, { contract, newOwner }) {
    return [encodeAction(contract, "transferOwnership(address)", [newOwner])];
  },
});
