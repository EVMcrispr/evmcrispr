import { defineHelper, Num } from "@evmcrispr/sdk";
import type Semaphore from "..";
import { parseGroupId, readSemaphore } from "../utils/semaphore";

export default defineHelper<Semaphore>({
  name: "depth",
  description: "The current depth of a Semaphore group's member tree.",
  returnType: "number",
  batchable: false,
  args: [{ name: "group", type: "number", description: "Group id" }],
  async run(module, { group }) {
    return Num.fromBigInt(
      await readSemaphore(module, "getMerkleTreeDepth", [parseGroupId(group)]),
    );
  },
});
