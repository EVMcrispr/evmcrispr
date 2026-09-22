import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import {
  amountParam,
  getSmartCompileContext,
  isRuntimeValue,
} from "@evmcrispr/sdk/onchain";
import type Giveth from "..";
import { parseAmountOrMax } from "../utils/amounts";
import { lockableBalance, requireGivpower } from "../utils/givpower";
import { recordVirtual } from "../utils/ledger";

export default defineCommand<Giveth>({
  smartSupport: { kind: "runtime" },
  name: "unstake",
  description:
    "Unstake GIV from GIVpower: unwrap gGIV on Gnosis, withdraw from the staking contract on Optimism and Polygon zkEVM. Pass `max` as the amount to unstake everything the contract allows right now — staked GIV minus locks, where locks whose round already ended still count until giveth:unlock frees them (see @giveth:unlockable). A zero amount does nothing.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
      runtime: true,
      description:
        "Amount of GIV to unstake in base units (wei), or the keyword `max` for everything not locked",
    },
  ],
  completions: {
    amount: () => [fieldItem("max")],
  },
  async run(module, { amount }, { interpreters }) {
    const parsed = parseAmountOrMax(amount);
    if (parsed === "max" && getSmartCompileContext(module))
      throw new ErrorException(
        "max requires GIVpower lock storage that has no on-chain view; provide an explicit amount or a supported runtime expression",
      );
    const { chainId, deployment } = await requireGivpower(module);
    const account = await module.getSender();

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

    if (!isRuntimeValue(unstaked))
      recordVirtual(module, interpreters, chainId, account, {
        staked: -unstaked,
        giv: unstaked,
      });
    if (deployment.kind === "garden") {
      return [
        encodeAction(deployment.garden!, "unwrap(uint256)", [
          amountParam(unstaked),
        ]),
      ];
    }
    return [
      encodeAction(deployment.lm, "withdraw(uint256)", [amountParam(unstaked)]),
    ];
  },
});
