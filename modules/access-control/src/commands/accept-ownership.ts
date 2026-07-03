import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "accept-ownership",
  description:
    "Accept a pending ownership transfer of an Ownable2Step contract. Must be sent by the pending owner.",
  args: [
    {
      name: "contract",
      type: "address",
      description: "Ownable2Step contract address",
    },
  ],
  async run(_module, { contract }) {
    return [encodeAction(contract, "acceptOwnership()", [])];
  },
});
