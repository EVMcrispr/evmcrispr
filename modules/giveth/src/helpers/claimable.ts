import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { tokenDistroAbi } from "../abis";
import { requireDistro } from "../utils/givpower";
import { virtualOf } from "../utils/ledger";

export default defineHelper<Giveth>({
  name: "claimable",
  batchable: false,
  description:
    "GIV an account can claim from the GIVstream right now (see giveth:claim). Counts a pending giveth:claim earlier in the script as already claimed.",
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
    const distro = await requireDistro(module);
    const chainId = await module.getChainId();
    const owner = account ?? (await module.getConnectedAccount(true));
    const client = await module.getClient();
    const claimable = await client.readContract({
      address: distro,
      abi: tokenDistroAbi,
      functionName: "claimableNow",
      args: [owner],
    });
    const claimed = virtualOf(
      module,
      interpreters.batchContext,
      chainId,
      owner,
      "claimed",
    );
    return Num.fromBigInt(claimable > claimed ? claimable - claimed : 0n);
  },
});
