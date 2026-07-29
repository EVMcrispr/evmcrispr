import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Giveth from "..";
import { parseAmountOrMax } from "../utils/amounts";
import { lockableBalance, requireGivpower } from "../utils/givpower";
import { recordVirtual } from "../utils/ledger";

export default defineCommand<Giveth>({
  name: "lock",
  description:
    "Lock staked GIV for a number of GIVpower rounds (2 weeks each) to multiply its GIVpower. Pass `max` as the amount to lock all staked GIV that is not already locked; a zero amount does nothing. Locked GIV cannot be unstaked until the last round ends and it is unlocked.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
      description:
        "Amount of staked GIV to lock in base units (wei), or the keyword `max` for all staked GIV not already locked (see @giveth:lockable)",
    },
    {
      name: "rounds",
      type: "number",
      description: "Number of rounds to lock for (each round lasts 2 weeks)",
    },
  ],
  completions: {
    amount: () => [fieldItem("max")],
  },
  async run(module, { amount, rounds }, { interpreters }) {
    const parsed = parseAmountOrMax(amount);
    const numRounds = Num(rounds).toBigInt();
    if (numRounds <= 0n) {
      throw new ErrorException("<rounds> must be greater than zero");
    }
    const { chainId, deployment } = await requireGivpower(module);
    const account = await module.getConnectedAccount(true);

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

    recordVirtual(module, interpreters, chainId, account, { locked });
    return [
      encodeAction(deployment.lm, "lock(uint256,uint256)", [
        Num.fromBigInt(locked),
        Num.fromBigInt(numRounds),
      ]),
    ];
  },
});
