import { ErrorException } from "@evmcrispr/sdk";
import { parseAbi } from "viem";
import { abiAction } from "../utils/encode";
import type { GovernanceAdapter } from "./types";

export const TOKEN_VOTING_ABI = parseAbi([
  "function createProposal(bytes metadata, (address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap, uint64 startDate, uint64 endDate, uint8 voteOption, bool tryEarlyExecution) returns (uint256 proposalId)",
  "function vote(uint256 proposalId, uint8 voteOption, bool tryEarlyExecution)",
  "function execute(uint256 proposalId)",
]);

const tokenVoting: GovernanceAdapter = {
  id: "token-voting",
  repoSubdomains: ["token-voting"],

  buildCreateProposal(plugin, actions, opts) {
    if (opts.approve !== undefined) {
      throw new ErrorException(
        "the token-voting plugin has no approvals; use --vote instead of --approve",
      );
    }

    return [
      abiAction(plugin, TOKEN_VOTING_ABI, "createProposal", [
        opts.metadata,
        actions,
        opts.allowFailureMap,
        opts.start,
        opts.end,
        opts.vote ?? 0,
        opts.tryExecution ?? false,
      ]),
    ];
  },

  buildVote(plugin, proposalId, option, tryEarlyExecution) {
    return [
      abiAction(plugin, TOKEN_VOTING_ABI, "vote", [
        proposalId,
        option,
        tryEarlyExecution,
      ]),
    ];
  },

  buildExecute(plugin, proposalId) {
    return [abiAction(plugin, TOKEN_VOTING_ABI, "execute", [proposalId])];
  },
};

export default tokenVoting;
