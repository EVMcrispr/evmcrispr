import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { requireGivpower, stakedBalance } from "../utils/givpower";

export default defineHelper<Giveth>({
  name: "staked",
  batchable: false,
  description:
    "Raw GIV an account has staked for GIVpower: the gGIV balance on Gnosis, the deposit balance on Optimism and Polygon zkEVM. Includes locked GIV (see @giveth:unstakable).",
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
    return Num.fromBigInt(await stakedBalance(module, deployment, owner));
  },
});
