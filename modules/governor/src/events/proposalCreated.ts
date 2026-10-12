import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";

export default defineEvent({
  name: "proposalCreated",
  description: "Governor: a created proposal exists and is pending.",
  event:
    "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
  suggest: async (env, { emitter, logs }) => {
    const out = [];
    for (const { proposalId } of logs) {
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function state(uint256) view returns (uint8)",
            args: [proposalId],
            expect: 0,
          },
          `assert ${emitter}::!{state(uint256)(uint8) ${proposalId}} == 0`,
          `The proposal created on ${truncateAddress(emitter)} is pending`,
        )),
      );
    }
    return out;
  },
});
