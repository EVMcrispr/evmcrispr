import {
  coerceBoolean,
  defineCommand,
  encodeAction,
  Num,
} from "@evmcrispr/sdk";
import type Giveth from "..";
import { parseAmount } from "../utils/amounts";
import { buildApprovalActions } from "../utils/approval";
import { requireGivpower } from "../utils/givpower";

export default defineCommand<Giveth>({
  name: "stake",
  description:
    "Stake GIV for GIVpower, approving the staking contract automatically when needed. On Gnosis GIV is wrapped into gGIV through the GIVgarden (which auto-stakes it); on Optimism and Polygon zkEVM it is staked directly. Staked GIV earns GIVstream rewards and can be locked for more GIVpower.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount of GIV to stake, in base units (wei)",
    },
  ],
  opts: [
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
    },
  ],
  async run(module, { amount }, { opts }) {
    const staked = parseAmount(amount);
    const { giv, deployment } = await requireGivpower(module);
    const spender =
      deployment.kind === "garden" ? deployment.garden! : deployment.lm;

    const skipApprove =
      opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]);
    const owner = await module.getConnectedAccount(true);
    const approvals = skipApprove
      ? []
      : await buildApprovalActions(module, giv, owner, spender, staked);

    const stakeAction =
      deployment.kind === "garden"
        ? encodeAction(spender, "wrap(uint256)", [Num.fromBigInt(staked)])
        : encodeAction(spender, "stake(uint256)", [Num.fromBigInt(staked)]);
    return [...approvals, stakeAction];
  },
});
