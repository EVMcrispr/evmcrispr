import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { encodeFunctionData } from "viem";
import { TOKEN_VOTING_ABI } from "../../../src/plugins/token-voting";
import { DAO_ADDRESS, PREAMBLE, TOKEN_VOTING_PLUGIN } from "../../fixtures";

describeCommand("execute-proposal", {
  module: "aragonosx",
  preamble: `${PREAMBLE}\naragonosx:connect ${DAO_ADDRESS} (`,
  cases: [
    {
      name: "executes a passed proposal",
      script: `aragonosx:execute-proposal token-voting 3\n)`,
      expectedActions: [
        {
          to: TOKEN_VOTING_PLUGIN,
          data: encodeFunctionData({
            abi: TOKEN_VOTING_ABI,
            functionName: "execute",
            args: [3n],
          }),
        },
      ],
    },
  ],
  errorCases: [
    {
      name: "rejects executing on the admin plugin",
      script: `aragonosx:execute-proposal admin 3\n)`,
      error: "doesn't support explicit execution",
    },
  ],
  docCases: [
    {
      description: "Execute a token-voting proposal that has passed",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:execute-proposal token-voting 3
)`,
    },
  ],
});
