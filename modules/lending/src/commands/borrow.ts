import { defineCommand } from "@evmcrispr/sdk";
import type Lending from "..";
import { resolveAdapter } from "../adapters/registry";
import { parseAmount, rejectNative } from "../utils/amounts";

export default defineCommand<Lending>({
  name: "borrow",
  description:
    "Borrow a token from a lending market against the connected account's collateral (variable rate). The borrowed tokens go to the connected account.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount to borrow, in base units (wei)",
    },
    {
      name: "token",
      type: "address",
      description: "Token to borrow (use @token(SYM))",
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
      name: "on-behalf-of",
      type: "address",
      description:
        "Account whose debt grows (requires prior credit delegation; defaults to the connected account)",
    },
  ],
  async run(module, { amount, token }, { opts }) {
    rejectNative(token);
    const amountOut = parseAmount(amount);
    const chainId = await module.getChainId();
    const from = await module.getConnectedAccount(true);
    const onBehalfOf = opts["on-behalf-of"] ?? from;
    const adapter = await resolveAdapter(module, opts.using);
    const plan = await adapter.buildBorrow(module, {
      chainId,
      token,
      amount: amountOut,
      from,
      onBehalfOf,
      to: from,
    });
    return plan.actions;
  },
});
