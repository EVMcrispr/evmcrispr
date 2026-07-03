import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Governor from "..";
import { collectBlockActions, hashDescription } from "../utils";

export default defineCommand<Governor>({
  name: "cancel",
  description:
    "Cancel a pending Governor proposal (only its proposer, before voting starts). Takes the same description and action block used in governor:propose.",
  args: [
    { name: "governor", type: "address", description: "Governor address" },
    {
      name: "description",
      type: "string",
      description: "Proposal description used when proposing",
    },
    {
      name: "actions",
      type: "block",
      description: "Block of commands making up the proposal",
    },
  ],
  async run(module, { governor, description, actions }, { interpreters }) {
    const { targets, values, calldatas } = await collectBlockActions(
      module.contextualName,
      "cancel",
      actions,
      interpreters,
    );

    return [
      encodeAction(governor, "cancel(address[],uint256[],bytes[],bytes32)", [
        targets,
        values,
        calldatas,
        hashDescription(description),
      ]),
    ];
  },
});
