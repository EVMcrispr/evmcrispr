import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "transfer",
  description:
    "Transfer ERC20 tokens from the connected account to a recipient.",
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
    return [encodeAction(token, "transfer(address,uint256)", [to, amount])];
  },
});
