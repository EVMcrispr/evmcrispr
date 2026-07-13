import { defineCommand, fieldItem } from "@evmcrispr/sdk";
import type Lending from "..";
import { resolveAdapter } from "../adapters/registry";
import { parseAmountOrMax, rejectNative } from "../utils/amounts";
import { withApproval } from "../utils/plan";

export default defineCommand<Lending>({
  name: "repay",
  description:
    "Repay borrowed tokens, approving the pool automatically when needed. Pass `max` as the amount to clear the debt dust-exact: the approval covers the current debt plus a 0.1% interest buffer, and the pool pulls only what is owed.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
      description:
        "Amount to repay in base units (wei), or the keyword `max` to repay the full debt",
    },
    {
      name: "token",
      type: "address",
      description: "Borrowed token to repay (use @token(SYM))",
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
        "Account whose debt is repaid (defaults to the connected account; not combinable with `max`)",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
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
    const onBehalfOf = opts["on-behalf-of"] ?? from;
    const adapter = await resolveAdapter(module, opts.using);
    const plan = await adapter.buildRepay(module, {
      chainId,
      token,
      amount: parsed,
      from,
      onBehalfOf,
      to: from,
    });
    return withApproval(module, plan, token, from, opts);
  },
});
