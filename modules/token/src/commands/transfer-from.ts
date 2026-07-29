import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "transfer-from",
  description:
    "Transfer ERC20 tokens from one account to another, consuming the sender allowance.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount in token units (wei)",
    },
    { name: "token", type: "address", description: "Token address" },
    { name: "from", type: "command", description: "Keyword `from`" },
    { name: "owner", type: "address", description: "Account to debit" },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "recipient", type: "address", description: "Recipient" },
  ],
  completions: {
    from: () => [fieldItem("from")],
    to: () => [fieldItem("to")],
  },
  async run(_module, { amount, token, from, owner, to, recipient }) {
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
    }
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    return [
      encodeAction(token, "transferFrom(address,address,uint256)", [
        owner,
        recipient,
        amount,
      ]),
    ];
  },
});
