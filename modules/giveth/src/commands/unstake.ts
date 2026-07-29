import { defineCommand, encodeAction, fieldItem, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { parseAmountOrMax } from "../utils/amounts";
import { lockableBalance, requireGivpower } from "../utils/givpower";
import { recordVirtual } from "../utils/ledger";

export default defineCommand<Giveth>({
  name: "unstake",
  description:
    "Unstake GIV from GIVpower: unwrap gGIV on Gnosis, withdraw from the staking contract on Optimism and Polygon zkEVM. Pass `max` as the amount to unstake everything the contract allows right now — staked GIV minus locks, where locks whose round already ended still count until giveth:unlock frees them (see @giveth:unlockable). A zero amount does nothing.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
      description:
        "Amount of GIV to unstake in base units (wei), or the keyword `max` for everything not locked",
    },
  ],
  completions: {
    amount: () => [fieldItem("max")],
  },
  async run(module, { amount }, { interpreters }) {
    const parsed = parseAmountOrMax(amount);
    const { chainId, deployment } = await requireGivpower(module);
    const account = await module.getConnectedAccount(true);

    // The lm gates withdrawals on balance − totalAmountLocked, the same
    // bound it applies to lock — hence lockableBalance.
    const unstaked =
      parsed === "max"
        ? await lockableBalance(
            module,
            interpreters.batchContext,
            chainId,
            deployment,
            account,
          )
        : parsed;
    if (unstaked === 0n) {
      return [];
    }

    recordVirtual(module, interpreters, chainId, account, {
      staked: -unstaked,
      giv: unstaked,
    });
    if (deployment.kind === "garden") {
      return [
        encodeAction(deployment.garden!, "unwrap(uint256)", [
          Num.fromBigInt(unstaked),
        ]),
      ];
    }
    return [
      encodeAction(deployment.lm, "withdraw(uint256)", [
        Num.fromBigInt(unstaked),
      ]),
    ];
  },
});
