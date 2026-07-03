import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "burn-from",
  description:
    "Burn tokens from another account, consuming the sender allowance (ERC20Burnable burnFrom function).",
  args: [
    { name: "token", type: "address", description: "Token address" },
    { name: "from", type: "address", description: "Account to burn from" },
    {
      name: "amount",
      type: "number",
      description: "Amount in token units (wei)",
    },
  ],
  async run(_module, { token, from, amount }) {
    return [encodeAction(token, "burnFrom(address,uint256)", [from, amount])];
  },
});
