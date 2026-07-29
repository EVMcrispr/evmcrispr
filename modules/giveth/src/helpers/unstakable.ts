import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { requireGivpower, unstakableBalance } from "../utils/givpower";

export default defineHelper<Giveth>({
  name: "unstakable",
  batchable: false,
  description:
    "GIV an account can unstake at the current chain time: staked GIV minus the locks whose GIVpower round hasn't finished yet. Locks whose round has ended count as unstakable — unlocking is permissionless — but still need a giveth:unlock before giveth:unstake accepts them. Time-aware inside sim:fork: after a wait, ended locks drop out of the locked amount. Counts pending stake/unstake/lock actions earlier in the script.",
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
      await unstakableBalance(
        module,
        interpreters.batchContext,
        chainId,
        deployment,
        owner,
      ),
    );
  },
});
