import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { resolveAdapter } from "../plugins/registry";

export default defineCommand<AragonOSx>({
  name: "execute-proposal",
  description: "Execute a passed proposal on a governance plugin.",
  args: [
    {
      name: "plugin",
      type: "plugin",
      description: "Governance plugin holding the proposal",
    },
    { name: "proposalId", type: "number", description: "Proposal id" },
  ],
  async run(module, { plugin: pluginIdentifier, proposalId }) {
    const { plugin } = module.resolvePlugin(
      pluginIdentifier,
      "execute-proposal",
    );
    const adapter = resolveAdapter(plugin);

    if (!adapter.buildExecute) {
      throw new ErrorException(
        `the ${adapter.id} plugin doesn't support explicit execution`,
      );
    }

    return adapter.buildExecute(plugin.address, BigInt(proposalId));
  },
});
