import { defineCommand } from "@evmcrispr/sdk";
import type Lending from "..";
import { resolveAdapter } from "../adapters/registry";
import { parseAmount, rejectNative } from "../utils/amounts";
import { withApproval } from "../utils/plan";

export default defineCommand<Lending>({
  name: "supply",
  description:
    "Supply a token to a lending market, approving the pool automatically when needed. Supplied tokens earn interest and can back borrows as collateral.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount to supply, in base units (wei)",
    },
    {
      name: "token",
      type: "address",
      description:
        "Token to supply (use @token(SYM); lending markets take the wrapped token, not the native one)",
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
        "Account credited with the supplied position (defaults to the connected account)",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
    },
  ],
  async run(module, { amount, token }, { opts }) {
    rejectNative(token);
    const amountIn = parseAmount(amount);
    const chainId = await module.getChainId();
    const from = await module.getConnectedAccount(true);
    const onBehalfOf = opts["on-behalf-of"] ?? from;
    const adapter = await resolveAdapter(module, opts.using);
    const plan = await adapter.buildSupply(module, {
      chainId,
      token,
      amount: amountIn,
      from,
      onBehalfOf,
      to: from,
    });
    return withApproval(module, plan, token, from, opts);
  },
});
