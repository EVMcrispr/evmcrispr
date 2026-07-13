import type { Action } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import type { OsxAction } from "../utils/osxActions";

/** Options collected by `propose` and handed to the adapter. */
export interface ProposeOpts {
  /** Proposal metadata bytes (conventionally an IPFS URI). */
  metadata: Hex;
  allowFailureMap: bigint;
  /** Start date (unix seconds); 0 = now. */
  start: bigint;
  /** End date (unix seconds); 0 = start + minimum duration. */
  end: bigint;
  /** Creation-time vote (TokenVoting): 0 None, 1 Abstain, 2 Yes, 3 No. */
  vote?: number;
  /** Approve on creation (Multisig). */
  approve?: boolean;
  /** Try (early) execution when the proposal passes within the same call. */
  tryExecution?: boolean;
}

/** Encodes proposal-lifecycle calls for one governance plugin type. */
export interface GovernanceAdapter {
  id: string;
  /** Plugin repo subdomains handled by this adapter. */
  repoSubdomains: string[];
  buildCreateProposal(
    plugin: Address,
    actions: OsxAction[],
    opts: ProposeOpts,
  ): Action[];
  buildVote?(
    plugin: Address,
    proposalId: bigint,
    option: number,
    tryEarlyExecution: boolean,
  ): Action[];
  buildApprove?(
    plugin: Address,
    proposalId: bigint,
    tryExecution: boolean,
  ): Action[];
  buildExecute?(plugin: Address, proposalId: bigint): Action[];
}

export const VOTE_OPTIONS: Record<string, number> = {
  none: 0,
  abstain: 1,
  yes: 2,
  no: 3,
};
