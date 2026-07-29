import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { resolveAdapter } from "../plugins/registry";

export default defineCommand<AragonOSx>({
  name: "approve",
  description: "Approve a multisig proposal.",
  args: [
    {
      name: "plugin",
      type: "plugin",
      description: "Multisig plugin holding the proposal",
    },
    { name: "proposalId", type: "number", description: "Proposal id" },
  ],
  opts: [
    {
      name: "try-execution",
      type: "bool",
      description: "Execute in the same call if the proposal already passes",
    },
  ],
  async run(module, { plugin: pluginIdentifier, proposalId }, { opts }) {
    const { plugin } = module.resolvePlugin(pluginIdentifier, "approve");
    const adapter = resolveAdapter(plugin);

    if (!adapter.buildApprove) {
      throw new ErrorException(
        `the ${adapter.id} plugin doesn't support approvals`,
      );
    }

    return adapter.buildApprove(
      plugin.address,
      BigInt(proposalId),
      opts["try-execution"] ?? false,
    );
  },
});
