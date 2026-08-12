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
  name: "root",
  description: "The current Merkle root of a Semaphore group's member tree.",
  returnType: "number",
  batchable: false,
  args: [{ name: "group", type: "number", description: "Group id" }],
  async run(module, { group }) {
    return Num.fromBigInt(
      await readSemaphore(module, "getMerkleTreeRoot", [parseGroupId(group)]),
    );
  },
  compile: async (ctx, node) => {
    const { address } = await requireSemaphore(ctx.module);
    return callReadOperand(
      ctx,
      address,
      getAbiItem({
        abi: SEMAPHORE_ABI,
        name: "getMerkleTreeRoot",
      }) as AbiFunction,
      [node.args[0]],
      "Uint",
    );
  },
});
