import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { lockableBalance, requireGivpower } from "../utils/givpower";

export default defineHelper<Giveth>({
  name: "lockable",
  batchable: false,
  description:
    "Staked GIV an account can lock (or unstake) right now: staked GIV minus everything the GIVpower contract counts as locked, including ended locks that were never unlocked (see @giveth:unlockable). Counts pending stake/lock actions earlier in the script, so it is what `lock max` resolves to.",
  returnType: "number",
  args: [
    {
      name: "account",
      type: "address",
      optional: true,
      description: "Account to inspect (defaults to the connected account)",
    },
  ],
  async run(module, { account }, { interpreters }) {
    const { chainId, deployment } = await requireGivpower(module);
    const owner = account ?? (await module.getConnectedAccount(true));
    return Num.fromBigInt(
      await lockableBalance(
        module,
        interpreters.batchContext,
        chainId,
        deployment,
        owner,
      ),
    );
  },
});
