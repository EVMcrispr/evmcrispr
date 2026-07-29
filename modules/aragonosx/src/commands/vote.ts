import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { resolveAdapter } from "../plugins/registry";
import { VOTE_OPTIONS } from "../plugins/types";

export default defineCommand<AragonOSx>({
  name: "vote",
  description: "Vote on a token-voting proposal.",
  args: [
    {
      name: "plugin",
      type: "plugin",
      description: "Voting plugin holding the proposal",
    },
    { name: "proposalId", type: "number", description: "Proposal id" },
    {
      name: "option",
      type: "string",
      description: "yes, no or abstain",
    },
  ],
  opts: [
    {
      name: "try-early-execution",
      type: "bool",
      description: "Execute in the same call if the proposal already passes",
    },
  ],
  async run(
    module,
    { plugin: pluginIdentifier, proposalId, option },
    { opts },
  ) {
    const { plugin } = module.resolvePlugin(pluginIdentifier, "vote");
    const adapter = resolveAdapter(plugin);

    if (!adapter.buildVote) {
      throw new ErrorException(
        `the ${adapter.id} plugin doesn't support voting`,
      );
    }

    const voteOption = VOTE_OPTIONS[String(option).toLowerCase()];
    if (voteOption === undefined || voteOption === 0) {
      throw new ErrorException(
        `invalid vote option "${option}"; expected yes, no or abstain`,
      );
    }

    return adapter.buildVote(
      plugin.address,
      BigInt(proposalId),
      voteOption,
      opts["try-early-execution"] ?? false,
    );
  },
});
