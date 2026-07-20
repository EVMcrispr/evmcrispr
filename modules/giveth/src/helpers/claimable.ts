import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { tokenDistroAbi } from "../abis";
import { requireDistro } from "../utils/givpower";

export default defineHelper<Giveth>({
  name: "claimable",
  batchable: false,
  description:
    "GIV an account can claim from the GIVstream right now (see giveth:claim).",
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
    const distro = await requireDistro(module);
    const owner = account ?? (await module.getConnectedAccount(true));
    const client = await module.getClient();
    const claimable = await client.readContract({
      address: distro,
      abi: tokenDistroAbi,
      functionName: "claimableNow",
      args: [owner],
    });
    return Num.fromBigInt(claimable);
  },
});
