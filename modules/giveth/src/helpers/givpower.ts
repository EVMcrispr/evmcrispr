import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { givpowerAbi } from "../abis";
import { requireGivpower } from "../utils/givpower";

export default defineHelper<Giveth>({
  name: "givpower",
  batchable: false,
  description:
    "GIVpower balance of an account: staked GIV plus the extra power gained from locking.",
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
    const client = await module.getClient();
    const power = await client.readContract({
      address: deployment.lm,
      abi: givpowerAbi,
      functionName: "balanceOf",
      args: [owner],
    });
    return Num.fromBigInt(power);
  },
});
