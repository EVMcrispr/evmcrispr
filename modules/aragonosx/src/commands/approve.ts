import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isRuntimeValue } from "@evmcrispr/sdk/onchain";
import type AragonOSx from "..";
import { resolveAdapter } from "../plugins/registry";

export default defineCommand<AragonOSx>({
  smartSupport: { kind: "runtime" },
  name: "approve",
  description: "Approve a multisig proposal.",
  args: [
    {
      name: "plugin",
      type: "plugin",
      description: "Multisig plugin holding the proposal",
    },
    {
      name: "proposalId",
      type: "number",
      runtime: true,
      description: "Proposal id",
    },
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
      isRuntimeValue(proposalId) ? proposalId : BigInt(proposalId),
      opts["try-execution"] ?? false,
    );
  },
});
