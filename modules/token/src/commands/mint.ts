import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "mint",
  description:
    "Mint tokens to an account. Calls the mint(address,uint256) function commonly exposed by OpenZeppelin-based ERC20 tokens (usually role- or owner-gated).",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount in token units (wei)",
    },
    { name: "token", type: "address", description: "Token address" },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "account", type: "address", description: "Recipient" },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(_module, { amount, token, to, account }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    return [encodeAction(token, "mint(address,uint256)", [account, amount])];
  },
});
