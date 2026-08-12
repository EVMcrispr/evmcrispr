import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type Semaphore from "..";
import {
  parseGroupId,
  readSemaphore,
  requireSemaphore,
  SEMAPHORE_ABI,
} from "../utils/semaphore";

export default defineHelper<Semaphore>({
  name: "size",
  description:
    "The number of leaves in a Semaphore group's member tree (removed members keep their slot as 0).",
  returnType: "number",
  batchable: false,
  args: [{ name: "group", type: "number", description: "Group id" }],
  async run(module, { group }) {
    return Num.fromBigInt(
      await readSemaphore(module, "getMerkleTreeSize", [parseGroupId(group)]),
    );
  },
  compile: async (ctx, node) => {
    const { address } = await requireSemaphore(ctx.module);
    return callReadOperand(
      ctx,
      address,
      getAbiItem({
        abi: SEMAPHORE_ABI,
        name: "getMerkleTreeSize",
      }) as AbiFunction,
      [node.args[0]],
      "Uint",
    );
  },
});
