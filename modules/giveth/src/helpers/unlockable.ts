import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { requireGivpower, unlockableBalance } from "../utils/givpower";

export default defineHelper<Giveth>({
  name: "unlockable",
  batchable: false,
  description:
    "GIV in locks whose GIVpower round has ended but that giveth:unlock hasn't freed yet. Until unlocked, the GIVpower contract still counts it as locked, so it can be neither locked again nor unstaked. Time-aware inside sim:fork: after a wait, newly ended locks show up here.",
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
      await unlockableBalance(
        module,
        interpreters.batchContext,
        chainId,
        deployment,
        owner,
      ),
    );
  },
});
