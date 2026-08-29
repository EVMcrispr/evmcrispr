import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, withSender } from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { resolveAdapter } from "../plugins/registry";
import { VOTE_OPTIONS } from "../plugins/types";
import { toMetadataBytes } from "../utils/metadata";
import { toOsxActions } from "../utils/osxActions";

export default defineCommand<AragonOSx>({
  name: "propose",
  description:
    "Wrap actions into a proposal on one of the DAO's governance plugins.",
  createsBatchContext: true,
  args: [
    {
      name: "plugin",
      type: "plugin",
      description: "Governance plugin creating the proposal",
    },
    { name: "block", type: "block", description: "Actions to propose" },
  ],
  opts: [
    {
      name: "metadata",
      type: "string",
      description: "Proposal metadata (conventionally an IPFS URI)",
    },
    {
      name: "start",
      type: "number",
      description: "Start date (unix seconds); defaults to now",
    },
    {
      name: "end",
      type: "number",
      description: "End date (unix seconds); defaults to the minimum duration",
    },
    {
      name: "vote",
      type: "string",
      description: "Vote on creation (token-voting): yes, no or abstain",
    },
    {
      name: "approve",
      type: "bool",
      description: "Approve on creation (multisig)",
    },
    {
      name: "try-execution",
      type: "bool",
      description: "Execute in the same call if the proposal already passes",
    },
    {
      name: "allow-failure-map",
      type: "number",
      description: "Bitmap of actions allowed to fail (default none)",
    },
  ],
  async run(
    module,
    { plugin: pluginIdentifier, block },
    { opts, interpreters },
  ) {
    const { interpretNode } = interpreters;

    const { dao, plugin } = module.resolvePlugin(pluginIdentifier, "propose");
    const adapter = resolveAdapter(plugin);

    // A passed proposal executes from the DAO: `@sender` inside the block.
    const blockActions = (await withSender(module, dao.address, () =>
      interpretNode(block as BlockExpressionNode, {
        // Inherit hasActions from any enclosing batch context: reads inside
        // this block can't see the outer batch's actions either.
        batchContext: {
          name: "propose",
          hasActions: interpreters.batchContext?.hasActions ?? false,
        },
      }),
    )) as Action[];

    const osxActions = toOsxActions(blockActions, "propose");

    let vote: number | undefined;
    if (opts.vote !== undefined) {
      vote = VOTE_OPTIONS[String(opts.vote).toLowerCase()];
      if (vote === undefined) {
        throw new ErrorException(
          `invalid --vote value "${opts.vote}"; expected yes, no or abstain`,
        );
      }
    }

    return adapter.buildCreateProposal(plugin.address, osxActions, {
      metadata: toMetadataBytes(opts.metadata),
      allowFailureMap: opts["allow-failure-map"]
        ? BigInt(opts["allow-failure-map"])
        : 0n,
      start: opts.start ? BigInt(opts.start) : 0n,
      end: opts.end ? BigInt(opts.end) : 0n,
      vote,
      approve: opts.approve,
      tryExecution: opts["try-execution"],
    });
  },
});
