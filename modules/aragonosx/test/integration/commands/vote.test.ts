import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { encodeFunctionData } from "viem";
import { TOKEN_VOTING_ABI } from "../../../src/plugins/token-voting";
import { DAO_ADDRESS, PREAMBLE, TOKEN_VOTING_PLUGIN } from "../../fixtures";

describeCommand("vote", {
  module: "aragonosx",
  preamble: `${PREAMBLE}\naragonosx:connect ${DAO_ADDRESS} (`,
  cases: [
    {
      name: "votes yes with early execution",
      script: `aragonosx:vote token-voting 3 yes --try-early-execution true\n)`,
      expectedActions: [
        {
          to: TOKEN_VOTING_PLUGIN,
          data: encodeFunctionData({
            abi: TOKEN_VOTING_ABI,
            functionName: "vote",
            args: [3n, 2, true],
          }),
        },
      ],
    },
    {
      name: "votes no",
      script: `aragonosx:vote token-voting 3 no\n)`,
      expectedActions: [
        {
          to: TOKEN_VOTING_PLUGIN,
          data: encodeFunctionData({
            abi: TOKEN_VOTING_ABI,
            functionName: "vote",
            args: [3n, 3, false],
          }),
        },
      ],
    },
  ],
  errorCases: [
    {
      name: "rejects voting on a multisig plugin",
      script: `aragonosx:vote multisig 3 yes\n)`,
      error: "doesn't support voting",
    },
    {
      name: "rejects an invalid option",
      script: `aragonosx:vote token-voting 3 maybe\n)`,
      error: "invalid vote option",
    },
  ],
  docCases: [
    {
      description: "Vote yes on an open token-voting proposal",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:vote token-voting 3 yes
)`,
    },
  ],
});
