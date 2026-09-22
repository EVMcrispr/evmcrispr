import { parseFieldInput } from "@evmcrispr/module-circom";
import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { amountParam, isRuntimeValue } from "@evmcrispr/sdk/onchain";
import type Semaphore from "..";
import { parseGroupId, requireSemaphore } from "../utils/semaphore";

export default defineCommand<Semaphore>({
  smartSupport: { kind: "runtime" },
  name: "add-member",
  description:
    "Add an identity commitment (or an array of them) to a Semaphore group. Only the group admin can execute the resulting transaction.",
  args: [
    {
      name: "commitment",
      type: "any",
      runtime: true,
      description: "Identity commitment, or an array of commitments",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "group", type: "number", runtime: true, description: "Group id" },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { commitment, to, group }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const { address } = await requireSemaphore(module);
    const groupId = isRuntimeValue(group) ? group : parseGroupId(group);
    if (Array.isArray(commitment)) {
      const commitments = commitment.map((c, i) =>
        isRuntimeValue(c) ? c : parseFieldInput(c, `commitment[${i}]`),
      );
      return [
        encodeAction(address, "addMembers(uint256,uint256[])", [
          amountParam(groupId),
          commitments.map(amountParam),
        ]),
      ];
    }
    return [
      encodeAction(address, "addMember(uint256,uint256)", [
        amountParam(groupId),
        isRuntimeValue(commitment)
          ? commitment
          : amountParam(parseFieldInput(commitment, "commitment")),
      ]),
    ];
  },
});
