import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { requireGivpower, stakedBalance } from "../utils/givpower";
import { virtualOf } from "../utils/ledger";

export default defineHelper<Giveth>({
  name: "staked",
  batchable: false,
  description:
    "Raw GIV an account has staked for GIVpower: the gGIV balance on Gnosis, the deposit balance on Optimism and Polygon zkEVM. Includes locked GIV (see @giveth:unstakable) and counts pending giveth:stake/giveth:unstake actions earlier in the script.",
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
    const staked = await stakedBalance(module, deployment, owner);
    const vStaked = virtualOf(
      module,
      interpreters.batchContext,
      chainId,
      owner,
      "staked",
    );
    const total = staked + vStaked;
    return Num.fromBigInt(total > 0n ? total : 0n);
  },
});
