import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData } from "viem";
import { polygon } from "viem/chains";
import { oneBalanceAbi } from "../../../src/abis";
import { ONE_BALANCE, USDC_POLYGON } from "../../fixtures";
import {
  SETTLED_PROOF,
  SETTLED_TOTAL,
  settledSponsors,
} from "../../fixtures/msw-handlers";

function decodeOneBalance(actions: any[], expected: string) {
  expect(actions).to.have.length(1);
  const action = actions[0];
  expect((action.to as string).toLowerCase()).to.eq(ONE_BALANCE.toLowerCase());
  const { functionName, args } = decodeFunctionData({
    abi: oneBalanceAbi,
    data: action.data,
  });
  expect(functionName).to.eq(expected);
  return args as unknown as [string, bigint, bigint, readonly string[]];
}

for (const [command, fn] of [
  ["withdraw", "withdraw"],
  ["cancel-withdrawal", "cancelWithdrawalRequest"],
] as const) {
  describeCommand(command, {
    module: "gelato",
    preamble: "load gelato",
    chainId: polygon.id,
    cases: [
      {
        name: "presents the settlement published by the 1Balance API",
        script: `gelato:${command} 10e6 USDC`,
        setup: () => settledSponsors.add(TEST_ACCOUNT_ADDRESS.toLowerCase()),
        validate: (actions) => {
          settledSponsors.clear();
          const [token, amount, total, proof] = decodeOneBalance(actions, fn);
          expect(token.toLowerCase()).to.eq(USDC_POLYGON.toLowerCase());
          expect(amount).to.eq(10_000_000n);
          expect(total).to.eq(SETTLED_TOTAL);
          expect(proof).to.eql(SETTLED_PROOF);
        },
      },
      {
        name: "takes --proof and --total instead of asking the API",
        script: `gelato:${command} 10e6 USDC --proof [${SETTLED_PROOF[0]}] --total 40e6`,
        validate: (actions) => {
          const [, , total, proof] = decodeOneBalance(actions, fn);
          expect(total).to.eq(40_000_000n);
          expect(proof).to.eql([SETTLED_PROOF[0]]);
        },
      },
    ],
    errorCases: [
      {
        name: "explains an unsettled request",
        script: `gelato:${command} 10e6 USDC`,
        error: "no settled withdrawal",
      },
      {
        name: "rejects --proof without --total",
        script: `gelato:${command} 10e6 USDC --proof [${SETTLED_PROOF[0]}]`,
        error: "--proof and --total go together",
      },
      {
        name: "rejects a malformed proof",
        script: `gelato:${command} 10e6 USDC --proof [0x1234] --total 40e6`,
        error: "bytes32 hashes",
      },
    ],
    docCases:
      command === "withdraw"
        ? [
            {
              description:
                "Withdraw 10 USDC once Gelato has settled your request (proof fetched automatically)",
              code: `gelato:withdraw 10e6 USDC --proof [0x1111111111111111111111111111111111111111111111111111111111111111] --total 40e6`,
            },
          ]
        : [
            {
              description:
                "Change your mind and return a settled request to the Gas Tank",
              code: `gelato:cancel-withdrawal 10e6 USDC --proof [0x1111111111111111111111111111111111111111111111111111111111111111] --total 40e6`,
            },
          ],
  });
}
