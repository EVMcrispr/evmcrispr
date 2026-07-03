import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "mint",
  description:
    "Mint tokens to an account. Calls the mint(address,uint256) function commonly exposed by OpenZeppelin-based ERC20 tokens (usually role- or owner-gated).",
  args: [
    { name: "token", type: "address", description: "Token address" },
    { name: "to", type: "address", description: "Recipient" },
    {
      name: "amount",
      type: "number",
      description: "Amount in token units (wei)",
    },
  ],
  async run(_module, { token, to, amount }) {
    return [encodeAction(token, "mint(address,uint256)", [to, amount])];
  },
});
