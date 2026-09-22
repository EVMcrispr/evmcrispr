import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "renounce-ownership",
  description:
    "Renounce ownership of an Ownable contract, leaving it without an owner and permanently disabling its onlyOwner functions.",
  args: [
    {
      name: "contract",
      type: "address",
      runtime: true,
      description: "Ownable contract address",
    },
  ],
  async run(_module, { contract }) {
    return [encodeAction(contract, "renounceOwnership()", [])];
  },
});
