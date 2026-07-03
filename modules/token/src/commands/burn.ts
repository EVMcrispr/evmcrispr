import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "burn",
  description:
    "Burn tokens from the connected account (ERC20Burnable burn function).",
  args: [
    { name: "token", type: "address", description: "Token address" },
    {
      name: "amount",
      type: "number",
      description: "Amount in token units (wei)",
    },
  ],
  async run(_module, { token, amount }) {
    return [encodeAction(token, "burn(uint256)", [amount])];
  },
});
