import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  name: "approve",
  description: "Approve a spender for an ERC20 token allowance.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Allowance in token units (wei)",
    },
    { name: "token", type: "address", description: "Token address" },
    { name: "for", type: "command", description: "Keyword `for`" },
    { name: "spender", type: "address", description: "Spender address" },
  ],
  completions: { for: () => [fieldItem("for")] },
  async run(_module, { amount, token, for: forKeyword, spender }) {
    if (forKeyword !== "for") {
      throw new ErrorException(`expected keyword "for", got "${forKeyword}"`);
    }
    return [encodeAction(token, "approve(address,uint256)", [spender, amount])];
  },
});
