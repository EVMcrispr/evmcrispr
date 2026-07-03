import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Governor from "..";
import { collectBlockActions, hashDescription } from "../utils";

export default defineCommand<Governor>({
  name: "execute",
  description:
    "Execute a succeeded (and queued, if the Governor uses a timelock) proposal. Takes the same description and action block used in governor:propose.",
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
    const { targets, values, calldatas, totalValue } =
      await collectBlockActions(
        module.contextualName,
        "execute",
        actions,
        interpreters,
      );

    const action = encodeAction(
      governor,
      "execute(address[],uint256[],bytes[],bytes32)",
      [targets, values, calldatas, hashDescription(description)],
      // execute is payable: it must forward the ETH the proposal actions spend
      totalValue > 0n ? { value: totalValue } : undefined,
    );

    return [action];
  },
});
