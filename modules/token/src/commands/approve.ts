import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Token from "..";

export default defineCommand<Token>({
  smartSupport: { kind: "runtime" },
  name: "approve",
  description: "Approve a spender for an ERC20 token allowance.",
  args: [
    {
      name: "amount",
      type: "number",
      runtime: true,
      description: "Allowance in token units (wei)",
    },
    {
      name: "token",
      type: "address",
      runtime: true,
      description: "Token address",
    },
    { name: "for", type: "command", description: "Keyword `for`" },
    {
      name: "spender",
      type: "address",
      runtime: true,
      description: "Spender address",
    },
  ],
  completions: { for: () => [fieldItem("for")] },
  async run(_module, { amount, token, for: forKeyword, spender }) {
    if (forKeyword !== "for") {
      throw new ErrorException(`expected keyword "for", got "${forKeyword}"`);
    }
    return [
      encodeAction(token, "approve(address,uint256) returns (bool)", [
        spender,
        amount,
      ]),
    ];
  },
});
