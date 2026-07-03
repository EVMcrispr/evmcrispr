import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "set-approval-for-all",
  description:
    "Approve or revoke an operator for all ERC721 or ERC1155 tokens of the connected account.",
  args: [
    { name: "token", type: "address", description: "Token address" },
    { name: "operator", type: "address", description: "Operator address" },
    {
      name: "approved",
      type: "bool",
      description: "true to approve, false to revoke",
    },
  ],
  async run(_module, { token, operator, approved }) {
    return [
      encodeAction(token, "setApprovalForAll(address,bool)", [
        operator,
        approved,
      ]),
    ];
  },
});
