import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Governor from "..";

export default defineCommand<Governor>({
  name: "delegate",
  description:
    "Delegate the voting power the connected account holds in an ERC20Votes/ERC721Votes token.",
  args: [
    { name: "token", type: "address", description: "Votes token address" },
    {
      name: "delegatee",
      type: "address",
      description: "Account receiving the voting power",
    },
  ],
  async run(_module, { token, delegatee }) {
    return [encodeAction(token, "delegate(address)", [delegatee])];
  },
});
