import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Governor from "..";
import { collectBlockActions, hashDescription } from "../utils";

export default defineCommand<Governor>({
  name: "queue",
  description:
    "Queue a succeeded Governor proposal into its timelock. Takes the same description and action block used in governor:propose.",
  createsBatchContext: true,
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
  async run(_module, { governor, description, actions }, { interpreters }) {
    const { targets, values, calldatas } = await collectBlockActions(
      "queue",
      actions,
      interpreters,
    );

    return [
      encodeAction(governor, "queue(address[],uint256[],bytes[],bytes32)", [
        targets,
        values,
        calldatas,
        hashDescription(description),
      ]),
    ];
  },
});
