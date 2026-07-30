import { defineHelper, Num } from "@evmcrispr/sdk";
import type Semaphore from "..";
import { parseGroupId, readSemaphore } from "../utils/semaphore";

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
});
