import {
  defineCommand,
  ErrorException,
  encodeAction,
  Num,
} from "@evmcrispr/sdk";
import type Giveth from "..";
import { parseAmount } from "../utils/amounts";
import { requireGivpower } from "../utils/givpower";

export default defineCommand<Giveth>({
  name: "lock",
  description:
    "Lock staked GIV for a number of GIVpower rounds (2 weeks each) to multiply its GIVpower. Locked GIV cannot be unstaked until the last round ends and it is unlocked.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount of staked GIV to lock, in base units (wei)",
    },
    {
      name: "rounds",
      type: "number",
      description: "Number of rounds to lock for (each round lasts 2 weeks)",
    },
  ],
  async run(module, { amount, rounds }) {
    const locked = parseAmount(amount);
    const numRounds = Num(rounds).toBigInt();
    if (numRounds <= 0n) {
      throw new ErrorException("<rounds> must be greater than zero");
    }
    const { deployment } = await requireGivpower(module);
    return [
      encodeAction(deployment.lm, "lock(uint256,uint256)", [
        Num.fromBigInt(locked),
        Num.fromBigInt(numRounds),
      ]),
    ];
  },
});
