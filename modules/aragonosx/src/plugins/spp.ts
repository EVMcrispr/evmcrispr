import { ErrorException } from "@evmcrispr/sdk";
import { parseAbi } from "viem";
import { abiAction } from "../utils/encode";
import type { GovernanceAdapter } from "./types";

export const SPP_ABI = parseAbi([
  "function createProposal(bytes metadata, (address to, uint256 value, bytes data)[] actions, uint128 allowFailureMap, uint64 startDate, bytes[][] proposalParams) returns (uint256 proposalId)",
  "function execute(uint256 proposalId)",
]);

/**
 * Staged Proposal Processor. Thin support: proposals are created with empty
 * per-body params; stages advance through their own bodies.
 */
const spp: GovernanceAdapter = {
  id: "staged-proposal-processor",
  repoSubdomains: ["staged-proposal-processor"],

  buildCreateProposal(plugin, actions, opts) {
    if (
      opts.vote !== undefined ||
      opts.approve !== undefined ||
      opts.tryExecution !== undefined
    ) {
      throw new ErrorException(
        "the staged-proposal-processor plugin advances through its stages; --vote/--approve/--try-execution don't apply",
      );
    }
    if (opts.end !== 0n) {
      throw new ErrorException(
        "the staged-proposal-processor plugin derives durations from its stages; --end doesn't apply",
      );
    }

    return [
      abiAction(plugin, SPP_ABI, "createProposal", [
        opts.metadata,
        actions,
        opts.allowFailureMap,
        opts.start,
        [],
      ]),
    ];
  },

  buildExecute(plugin, proposalId) {
    return [abiAction(plugin, SPP_ABI, "execute", [proposalId])];
  },
};

export default spp;
