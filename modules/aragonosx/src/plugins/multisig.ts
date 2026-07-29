import { ErrorException } from "@evmcrispr/sdk";
import { parseAbi } from "viem";
import { abiAction } from "../utils/encode";
import type { GovernanceAdapter } from "./types";

export const MULTISIG_ABI = parseAbi([
  "function createProposal(bytes metadata, (address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap, bool approveProposal, bool tryExecution, uint64 startDate, uint64 endDate) returns (uint256 proposalId)",
  "function approve(uint256 proposalId, bool tryExecution)",
  "function execute(uint256 proposalId)",
]);

const multisig: GovernanceAdapter = {
  id: "multisig",
  repoSubdomains: ["multisig"],

  buildCreateProposal(plugin, actions, opts) {
    if (opts.vote !== undefined) {
      throw new ErrorException(
        "the multisig plugin has no votes; use --approve instead of --vote",
      );
    }

    return [
      abiAction(plugin, MULTISIG_ABI, "createProposal", [
        opts.metadata,
        actions,
        opts.allowFailureMap,
        opts.approve ?? false,
        opts.tryExecution ?? false,
        opts.start,
        opts.end,
      ]),
    ];
  },

  buildApprove(plugin, proposalId, tryExecution) {
    return [
      abiAction(plugin, MULTISIG_ABI, "approve", [proposalId, tryExecution]),
    ];
  },

  buildExecute(plugin, proposalId) {
    return [abiAction(plugin, MULTISIG_ABI, "execute", [proposalId])];
  },
};

export default multisig;
