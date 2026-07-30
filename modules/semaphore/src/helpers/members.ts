import { loadPoseidon2 } from "@evmcrispr/module-zk";
import { defineHelper, Num } from "@evmcrispr/sdk";
import type Semaphore from "..";
import { getGroupMembers } from "../utils/members";
import { parseGroupId } from "../utils/semaphore";

export default defineHelper<Semaphore>({
  name: "members",
  description:
    "The ordered member commitments of a Semaphore group, reconstructed from contract events and checked against the on-chain root. Removed members appear as 0.",
  returnType: "array",
  batchable: false,
  args: [{ name: "group", type: "number", description: "Group id" }],
  async run(module, { group }) {
    const h = await loadPoseidon2();
    const members = await getGroupMembers(module, parseGroupId(group), h);
    return members.map(Num.fromBigInt);
  },
});
