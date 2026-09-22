import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import {
  amountParam,
  getSmartCompileContext,
  isRuntimeValue,
  positiveRuntimeAmount,
} from "@evmcrispr/sdk/onchain";
import type Giveth from "..";
import { parseAmountOrMax } from "../utils/amounts";
import { lockableBalance, requireGivpower } from "../utils/givpower";
import { recordVirtual } from "../utils/ledger";

export default defineCommand<Giveth>({
  smartSupport: { kind: "runtime" },
  name: "lock",
  description:
    "Lock staked GIV for a number of GIVpower rounds (2 weeks each) to multiply its GIVpower. Pass `max` as the amount to lock all staked GIV that is not already locked; a zero amount does nothing. Locked GIV cannot be unstaked until the last round ends and it is unlocked.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
      runtime: true,
      description:
        "Amount of staked GIV to lock in base units (wei), or the keyword `max` for all staked GIV not already locked (see @giveth:lockable)",
    },
    {
      name: "rounds",
      type: "number",
      runtime: true,
      description: "Number of rounds to lock for (each round lasts 2 weeks)",
    },
  ],
  completions: {
    amount: () => [fieldItem("max")],
  },
  async run(module, { amount, rounds }, { interpreters }) {
    const parsed = parseAmountOrMax(amount);
    if (parsed === "max" && getSmartCompileContext(module))
      throw new ErrorException(
        "max requires GIVpower lock storage that has no on-chain view; provide an explicit amount or a supported runtime expression",
      );
    const numRounds = isRuntimeValue(rounds)
      ? positiveRuntimeAmount(module, rounds)
      : Num(rounds).toBigInt();
    if (!isRuntimeValue(numRounds) && numRounds <= 0n) {
      throw new ErrorException("<rounds> must be greater than zero");
    }
    const { chainId, deployment } = await requireGivpower(module);
    const account = await module.getSender();

    const locked =
      parsed === "max"
        ? await lockableBalance(
            module,
            interpreters.batchContext,
            chainId,
            deployment,
            account,
          )
        : parsed;
    if (locked === 0n) {
      return [];
    }

    if (!isRuntimeValue(locked))
      recordVirtual(module, interpreters, chainId, account, { locked });
    return [
      encodeAction(deployment.lm, "lock(uint256,uint256)", [
        amountParam(locked),
        amountParam(numRounds),
      ]),
    ];
  },
});
