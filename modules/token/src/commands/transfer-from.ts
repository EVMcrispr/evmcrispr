import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "transfer-from",
  description:
    "Transfer ERC20 tokens from one account to another, consuming the sender allowance.",
  args: [
    { name: "token", type: "address", description: "Token address" },
    { name: "from", type: "address", description: "Account to debit" },
    { name: "to", type: "address", description: "Recipient" },
    {
      name: "amount",
      type: "number",
      description: "Amount in token units (wei)",
    },
  ],
  async run(_module, { token, from, to, amount }) {
    return [
      encodeAction(token, "transferFrom(address,address,uint256)", [
        from,
        to,
        amount,
      ]),
    ];
  },
});
