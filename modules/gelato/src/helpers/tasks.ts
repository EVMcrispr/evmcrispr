import { defineHelper } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Gelato from "..";
import { automateAbi } from "../abis";
import { AUTOMATE_ADDRESS } from "../addresses";
import { requireAutomate } from "../utils/protocol";

export async function taskIdsOf(
  module: Gelato,
  creator: Address,
): Promise<readonly `0x${string}`[]> {
  await requireAutomate(module);
  const client = await module.getClient();
  return client.readContract({
    address: AUTOMATE_ADDRESS,
    abi: automateAbi,
    functionName: "getTaskIdsByUser",
    args: [creator],
  });
}

export default defineHelper<Gelato>({
  name: "tasks",
  batchable: false,
  description:
    "Ids of the active Gelato Automate tasks an account created, oldest first.",
  returnType: "array",
  args: [
    {
      name: "creator",
      type: "address",
      description: "Task creator (defaults to the connected account)",
      optional: true,
    },
  ],
  async run(module, { creator }) {
    const account =
      (creator as Address | undefined) ?? (await module.getConnectedAccount());
    return [...(await taskIdsOf(module, account))];
  },
});
