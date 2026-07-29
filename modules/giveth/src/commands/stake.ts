import {
  coerceBoolean,
  defineCommand,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Giveth from "..";
import { parseAmountOrMax } from "../utils/amounts";
import { buildApprovalActions } from "../utils/approval";
import { requireGivpower, stakableBalance } from "../utils/givpower";
import { recordVirtual } from "../utils/ledger";

export default defineCommand<Giveth>({
  name: "stake",
  description:
    "Stake GIV for GIVpower, approving the staking contract automatically when needed. Pass `max` as the amount to stake the full GIV balance; a zero amount does nothing. On Gnosis GIV is wrapped into gGIV through the GIVgarden (which auto-stakes it); on Optimism and Polygon zkEVM it is staked directly. Staked GIV earns GIVstream rewards and can be locked for more GIVpower.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
      description:
        "Amount of GIV to stake in base units (wei), or the keyword `max` for the full GIV balance (see @giveth:stakable)",
    },
  ],
  opts: [
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
    },
  ],
  completions: {
    amount: () => [fieldItem("max")],
  },
  async run(module, { amount }, { opts, interpreters }) {
    const parsed = parseAmountOrMax(amount);
    const { chainId, giv, deployment } = await requireGivpower(module);
    const owner = await module.getConnectedAccount(true);

    const staked =
      parsed === "max"
        ? await stakableBalance(
            module,
            interpreters.batchContext,
            chainId,
            giv,
            owner,
          )
        : parsed;
    if (staked === 0n) {
      return [];
    }

    const spender =
      deployment.kind === "garden" ? deployment.garden! : deployment.lm;
    const skipApprove =
      opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]);
    const approvals = skipApprove
      ? []
      : await buildApprovalActions(module, giv, owner, spender, staked);

    const stakeAction =
      deployment.kind === "garden"
        ? encodeAction(spender, "wrap(uint256)", [Num.fromBigInt(staked)])
        : encodeAction(spender, "stake(uint256)", [Num.fromBigInt(staked)]);

    recordVirtual(module, interpreters, chainId, owner, {
      giv: -staked,
      staked: staked,
    });
    return [...approvals, stakeAction];
  },
});
