import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  smartSupport: { kind: "runtime" },
  name: "burn-from",
  description:
    "Burn tokens from another account, consuming the sender allowance (ERC20Burnable burnFrom function).",
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
    { name: "from", type: "command", description: "Keyword `from`" },
    {
      name: "account",
      type: "address",
      runtime: true,
      description: "Account to burn from",
    },
  ],
  completions: { from: () => [fieldItem("from")] },
  async run(_module, { amount, token, from, account }) {
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
    }
    return [
      encodeAction(token, "burnFrom(address,uint256)", [account, amount]),
    ];
  },
});
