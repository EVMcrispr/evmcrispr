import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  smartSupport: { kind: "runtime" },
  name: "transfer",
  description:
    "Transfer ERC20 tokens from the connected account to a recipient.",
  args: [
    {
      name: "amount",
      type: "number",
      runtime: true,
      description: "Amount in token units (wei)",
    },
    {
      name: "token",
      type: "address",
      runtime: true,
      description: "Token address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "recipient",
      type: "address",
      runtime: true,
      description: "Recipient",
    },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(_module, { amount, token, to, recipient }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    return [
      encodeAction(token, "transfer(address,uint256) returns (bool)", [
        recipient,
        amount,
      ]),
    ];
  },
});
