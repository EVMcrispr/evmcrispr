import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, getAddress, parseAbi } from "viem";
import { GIVPOWER_LM, SOME_ADDRESS } from "../../fixtures";

const givpowerAbi = parseAbi([
  "function unlock(address[] accounts, uint256 round)",
]);

describeCommand("unlock", {
  describeName: "Giveth > commands > unlock <round> [account...]",
  module: "giveth",
  preamble: "load giveth",
  cases: [
    {
      name: "unlocks the connected account by default",
      script: "giveth:unlock 117",
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const unlock = actions[0] as any;
        expect(unlock.to).to.eq(GIVPOWER_LM);
        const { functionName, args } = decodeFunctionData({
          abi: givpowerAbi,
          data: unlock.data,
        });
        expect(functionName).to.eq("unlock");
        expect(args).to.eql([[getAddress(TEST_ACCOUNT_ADDRESS)], 117n]);
      },
    },
    {
      name: "unlocks the accounts passed as rest arguments",
      script: `giveth:unlock 117 ${SOME_ADDRESS} ${TEST_ACCOUNT_ADDRESS}`,
      validate: (actions) => {
        const { args } = decodeFunctionData({
          abi: givpowerAbi,
          data: (actions[0] as any).data,
        });
        expect(args).to.eql([
          [getAddress(SOME_ADDRESS), getAddress(TEST_ACCOUNT_ADDRESS)],
          117n,
        ]);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on chains without a GIVpower deployment",
      script: "switch mainnet\ngiveth:unlock 117",
      error: "GIVpower is not deployed on chain 1",
    },
  ],
  docCases: [
    {
      description: "Unlock your GIV locks that ended at the previous round",
      code: "giveth:unlock @num(@giveth:round - 1)",
    },
  ],
});
