import { defineCommand, fieldItem } from "@evmcrispr/sdk";
import type Lending from "..";
import { resolveAdapter } from "../adapters/registry";
import { parseAmountOrMax, rejectNative } from "../utils/amounts";

export default defineCommand<Lending>({
  name: "withdraw",
  description:
    "Withdraw a supplied token from a lending market. Pass `max` as the amount to withdraw the full balance, accrued interest included.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
      description:
        "Amount to withdraw in base units (wei), or the keyword `max` for the full balance",
    },
    {
      name: "token",
      type: "address",
      description: "Supplied token to withdraw (use @token(SYM))",
    },
  ],
  opts: [
    {
      name: "using",
      type: "lending-adapter",
      description:
        "Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain)",
    },
    {
      name: "to",
      type: "address",
      description:
        "Recipient of the withdrawn tokens (defaults to the connected account)",
    },
  ],
  completions: {
    amount: () => [fieldItem("max")],
  },
  async run(module, { amount, token }, { opts }) {
    rejectNative(token);
    const parsed = parseAmountOrMax(amount);
    const chainId = await module.getChainId();
    const from = await module.getConnectedAccount(true);
    const adapter = await resolveAdapter(module, opts.using);
    const plan = await adapter.buildWithdraw(module, {
      chainId,
      token,
      amount: parsed,
      from,
      onBehalfOf: from,
      to: opts.to ?? from,
    });
    return plan.actions;
  },
});
