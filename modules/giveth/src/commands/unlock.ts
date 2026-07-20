import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Giveth from "..";
import { requireGivpower } from "../utils/givpower";

export default defineCommand<Giveth>({
  name: "unlock",
  description:
    "Unlock GIV locks that ended at the given GIVpower round, making the tokens unstakeable again. Anyone can unlock for any account once the round is over; the round must be earlier than the current one (see @giveth:round).",
  args: [
    {
      name: "round",
      type: "number",
      description:
        "The round the locks ended at (must be earlier than the current round)",
    },
    {
      name: "account",
      type: "address",
      rest: true,
      description: "Accounts to unlock (defaults to the connected account)",
    },
  ],
  async run(module, { round, account }) {
    const { deployment } = await requireGivpower(module);
    const accounts: Address[] =
      account && account.length > 0
        ? account
        : [await module.getConnectedAccount(true)];
    return [
      encodeAction(deployment.lm, "unlock(address[],uint256)", [
        accounts,
        Num(round),
      ]),
    ];
  },
});
