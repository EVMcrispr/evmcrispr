import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import type Governor from "..";
import { resolveVoteSupport } from "../argTypes";

export default defineCommand<Governor>({
  name: "vote",
  description: "Cast a vote on an active Governor proposal.",
  args: [
    { name: "governor", type: "address", description: "Governor address" },
    { name: "proposalId", type: "number", description: "Proposal id" },
    {
      name: "support",
      type: "voteSupport",
      description: "for, against or abstain",
    },
  ],
  opts: [
    {
      name: "reason",
      type: "string",
      description: "Reason for the vote, stored on-chain",
    },
  ],
  async run(_module, { governor, proposalId, support }, { opts }) {
    const supportValue = Num.fromBigInt(BigInt(resolveVoteSupport(support)));

    if (opts.reason !== undefined) {
      return [
        encodeAction(governor, "castVoteWithReason(uint256,uint8,string)", [
          proposalId,
          supportValue,
          opts.reason,
        ]),
      ];
    }

    return [
      encodeAction(governor, "castVote(uint256,uint8)", [
        proposalId,
        supportValue,
      ]),
    ];
  },
});
