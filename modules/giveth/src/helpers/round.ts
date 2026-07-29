import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { givpowerAbi } from "../abis";
import { requireGivpower } from "../utils/givpower";

export default defineHelper<Giveth>({
  name: "round",
  batchable: false,
  description:
    "The current GIVpower round number (rounds last 2 weeks; locks unlock when their round is over).",
  returnType: "number",
  args: [],
  async run(module) {
    const { deployment } = await requireGivpower(module);
    const client = await module.getClient();
    const round = await client.readContract({
      address: deployment.lm,
      abi: givpowerAbi,
      functionName: "currentRound",
    });
    return Num.fromBigInt(round);
  },
});
