import {
  leanProof,
  loadPoseidon2,
  parseFieldInput,
} from "@evmcrispr/module-circom";
import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Semaphore from "..";
import { getGroupMembers } from "../utils/members";
import { parseGroupId, requireSemaphore } from "../utils/semaphore";

export default defineCommand<Semaphore>({
  name: "remove-member",
  description:
    "Remove an identity commitment from a Semaphore group (the leaf becomes 0; the tree keeps its size). Computes the required Merkle siblings from the reconstructed member set — they go stale if the group changes before execution.",
  args: [
    {
      name: "commitment",
      type: "number",
      description: "Identity commitment to remove",
    },
    { name: "from", type: "command", description: "Keyword `from`" },
    { name: "group", type: "number", description: "Group id" },
  ],
  completions: { from: () => [fieldItem("from")] },
  async run(module, { commitment, from, group }) {
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
    }
    const { address } = await requireSemaphore(module);
    const groupId = parseGroupId(group);
    const target = parseFieldInput(commitment, "commitment");
    const h = await loadPoseidon2();
    const members = await getGroupMembers(module, groupId, h);
    const index = members.indexOf(target);
    if (index === -1) {
      throw new ErrorException(
        `semaphore: commitment ${target} is not a member of group ${groupId}`,
      );
    }
    const { siblings } = leanProof(members, index, h);
    return [
      encodeAction(address, "removeMember(uint256,uint256,uint256[])", [
        Num.fromBigInt(groupId),
        Num.fromBigInt(target),
        siblings.map(Num.fromBigInt),
      ]),
    ];
  },
});
