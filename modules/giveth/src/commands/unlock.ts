import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Giveth from "..";
import { requireGivpower, roundLockedAmount } from "../utils/givpower";
import { recordVirtual } from "../utils/ledger";

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
  async run(module, { round, account }, { interpreters }) {
    const { chainId, deployment } = await requireGivpower(module);
    const connected = await module.getConnectedAccount(true);
    const accounts: Address[] =
      account && account.length > 0 ? account : [connected];

    // Virtual accounting only tracks the connected account (the one whose
    // balances gate later max amounts in the same script).
    if (
      !interpreters.actionCallback &&
      accounts.some((a) => a.toLowerCase() === connected.toLowerCase())
    ) {
      const freed = await roundLockedAmount(
        module,
        deployment,
        connected,
        Num(round).toBigInt(),
      );
      recordVirtual(module, interpreters, chainId, connected, {
        locked: -freed,
        unlocked: freed,
      });
    }

    return [
      encodeAction(deployment.lm, "unlock(address[],uint256)", [
        accounts,
        Num(round),
      ]),
    ];
  },
});
