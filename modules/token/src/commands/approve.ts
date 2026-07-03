import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "approve",
  description: "Approve a spender for an ERC20 token allowance.",
  args: [
    { name: "token", type: "address", description: "Token address" },
    { name: "spender", type: "address", description: "Spender address" },
    {
      name: "amount",
      type: "number",
      description: "Allowance in token units (wei)",
    },
  ],
  async run(_module, { token, spender, amount }) {
    return [encodeAction(token, "approve(address,uint256)", [spender, amount])];
  },
});
