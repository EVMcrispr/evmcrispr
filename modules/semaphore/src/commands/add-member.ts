import { parseFieldInput } from "@evmcrispr/module-circom";
import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Semaphore from "..";
import { parseGroupId, requireSemaphore } from "../utils/semaphore";

export default defineCommand<Semaphore>({
  name: "add-member",
  description:
    "Add an identity commitment (or an array of them) to a Semaphore group. Only the group admin can execute the resulting transaction.",
  args: [
    {
      name: "commitment",
      type: "any",
      description: "Identity commitment, or an array of commitments",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "group", type: "number", description: "Group id" },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { commitment, to, group }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const { address } = await requireSemaphore(module);
    const groupId = parseGroupId(group);
    if (Array.isArray(commitment)) {
      const commitments = commitment.map((c, i) =>
        parseFieldInput(c, `commitment[${i}]`),
      );
      return [
        encodeAction(address, "addMembers(uint256,uint256[])", [
          Num.fromBigInt(groupId),
          commitments.map(Num.fromBigInt),
        ]),
      ];
    }
    return [
      encodeAction(address, "addMember(uint256,uint256)", [
        Num.fromBigInt(groupId),
        Num.fromBigInt(parseFieldInput(commitment, "commitment")),
      ]),
    ];
  },
});
