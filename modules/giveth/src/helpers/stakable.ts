import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { requireGivpower, stakableBalance } from "../utils/givpower";

export default defineHelper<Giveth>({
  name: "stakable",
  batchable: false,
  description:
    "GIV in an account's wallet that giveth:stake can stake for GIVpower. Counts pending claim/stake/unstake actions earlier in the script, so it is what `stake max` resolves to.",
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
    const { chainId, giv } = await requireGivpower(module);
    const owner = account ?? (await module.getConnectedAccount(true));
    return Num.fromBigInt(
      await stakableBalance(
        module,
        interpreters.batchContext,
        chainId,
        giv,
        owner,
      ),
    );
  },
});
