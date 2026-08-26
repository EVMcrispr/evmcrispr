import { defineCommand, ErrorException, fieldItem } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { encodeFunctionData } from "viem";
import type Gelato from "..";
import { oneBalanceAbi } from "../abis";
import { ONE_BALANCE } from "../addresses";
import { buildApprovalActions } from "../utils/approval";
import { parseAmount } from "../utils/duration";
import { resolveOneBalanceToken } from "../utils/oneBalance";

export default defineCommand<Gelato>({
  name: "fund",
  description:
    "Deposit USDC into the Gelato Gas Tank (1Balance) that pays for Automate, Web3 Function and VRF executions on every chain. Deposits happen on Polygon only; `for <sponsor>` credits another account (a DAO, a Safe) instead of yours. Approves the exact amount first when the allowance falls short.",
  args: [
    { name: "amount", type: "number", description: "USDC amount (6 decimals)" },
    { name: "token", type: "token-symbol", description: "USDC" },
    {
      name: "for",
      type: "command",
      description: "Keyword `for`",
      optional: true,
    },
    {
      name: "sponsor",
      type: "address",
      description: "Account to credit (defaults to the connected account)",
      optional: true,
    },
  ],
  opts: [
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the allowance check and approval",
    },
  ],
  completions: {
    for: () => [fieldItem("for")],
  },
  async run(module, { amount, token, for: forKeyword, sponsor }, { opts }) {
    if (forKeyword !== undefined && forKeyword !== "for") {
      throw new ErrorException(`expected keyword "for", got "${forKeyword}"`);
    }
    if (forKeyword === "for" && sponsor === undefined) {
      throw new ErrorException("expected a sponsor address after `for`");
    }
    const value = parseAmount(amount);
    const usdc = await resolveOneBalanceToken(module, String(token));
    const account = await module.getConnectedAccount();
    const beneficiary = (sponsor as Address | undefined) ?? account;
    const actions = opts["no-approve"]
      ? []
      : await buildApprovalActions(
          module,
          usdc,
          account,
          ONE_BALANCE.address,
          value,
        );
    actions.push({
      to: ONE_BALANCE.address,
      data: encodeFunctionData({
        abi: oneBalanceAbi,
        functionName: "depositToken",
        args: [beneficiary, usdc, value],
      }),
    });
    return actions;
  },
});
