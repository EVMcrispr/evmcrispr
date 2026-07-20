import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "burn",
  description:
    "Burn tokens from the connected account (ERC20Burnable burn function).",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount in token units (wei)",
    },
    { name: "token", type: "address", description: "Token address" },
  ],
  async run(_module, { amount, token }) {
    return [encodeAction(token, "burn(uint256)", [amount])];
  },
});
