import { ErrorException } from "@evmcrispr/sdk";
import { parseAbi } from "viem";
import { abiAction } from "../utils/encode";
import type { GovernanceAdapter } from "./types";

export const ADMIN_ABI = parseAbi([
  "function executeProposal(bytes metadata, (address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap)",
]);

/** Admin plugin: proposals execute immediately in the creation call. */
const admin: GovernanceAdapter = {
  id: "admin",
  repoSubdomains: ["admin"],

  buildCreateProposal(plugin, actions, opts) {
    if (opts.start !== 0n || opts.end !== 0n) {
      throw new ErrorException(
        "the admin plugin executes proposals immediately; --start/--end don't apply",
      );
    }
    if (opts.vote !== undefined || opts.approve !== undefined) {
      throw new ErrorException(
        "the admin plugin has no voting; --vote/--approve don't apply",
      );
    }

    return [
      abiAction(plugin, ADMIN_ABI, "executeProposal", [
        opts.metadata,
        actions,
        opts.allowFailureMap,
      ]),
    ];
  },
};

export default admin;
