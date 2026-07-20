import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import {
  requireGivpower,
  stakedBalance,
  stillLockedBalance,
} from "../utils/givpower";

export default defineHelper<Giveth>({
  name: "unstakable",
  batchable: false,
  description:
    "GIV an account can unstake at the current chain time: staked GIV minus the locks whose GIVpower round hasn't finished yet. Locks whose round has ended count as unstakable — unlocking is permissionless — but still need a giveth:unlock before giveth:unstake accepts them. Time-aware inside sim:fork: after a wait, ended locks drop out of the locked amount.",
  returnType: "number",
  args: [
    {
      name: "account",
      type: "address",
      optional: true,
      description: "Account to inspect (defaults to the connected account)",
    },
  ],
  async run(module, { account }) {
    const { deployment } = await requireGivpower(module);
    const owner = account ?? (await module.getConnectedAccount(true));
    const [staked, locked] = await Promise.all([
      stakedBalance(module, deployment, owner),
      stillLockedBalance(module, deployment, owner),
    ]);
    return Num.fromBigInt(staked > locked ? staked - locked : 0n);
  },
});
