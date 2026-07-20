import { defineCommand, encodeAction, fieldItem, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { parseAmountOrMax } from "../utils/amounts";
import { requireGivpower, stakedBalance } from "../utils/givpower";

export default defineCommand<Giveth>({
  name: "unstake",
  description:
    "Unstake GIV from GIVpower: unwrap gGIV on Gnosis, withdraw from the staking contract on Optimism and Polygon zkEVM. Pass `max` as the amount to unstake the full staked balance. Locked GIV cannot be unstaked until it is unlocked.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
      description:
        "Amount of GIV to unstake in base units (wei), or the keyword `max` for the full staked balance",
    },
  ],
  completions: {
    amount: () => [fieldItem("max")],
  },
  async run(module, { amount }) {
    const parsed = parseAmountOrMax(amount);
    const { deployment } = await requireGivpower(module);

    const unstaked =
      parsed === "max"
        ? await stakedBalance(
            module,
            deployment,
            await module.getConnectedAccount(true),
          )
        : parsed;

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
