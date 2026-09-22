import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import { boundedRuntimeAmount, isRuntimeValue } from "@evmcrispr/sdk/onchain";
import type Governor from "..";
import { resolveVoteSupport } from "../argTypes";

export default defineCommand<Governor>({
  smartSupport: { kind: "runtime" },
  name: "vote",
  description: "Cast a vote on an active Governor proposal.",
  args: [
    {
      name: "governor",
      runtime: true,
      type: "address",
      description: "Governor address",
    },
    {
      name: "proposalId",
      type: "number",
      runtime: true,
      description: "Proposal id",
    },
    {
      name: "support",
      runtime: true,
      type: "voteSupport",
      description:
        "for, against or abstain; runtime values use 0 (against), 1 (for), or 2 (abstain)",
    },
  ],
  opts: [
    {
      name: "reason",
      type: "string",
      runtime: true,
      description: "Reason for the vote, stored on-chain",
    },
  ],
  async run(module, { governor, proposalId, support }, { opts }) {
    const supportValue = isRuntimeValue(support)
      ? boundedRuntimeAmount(module, support, 0n, 2n, "uint8")
      : Num.fromBigInt(BigInt(resolveVoteSupport(support)));

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
