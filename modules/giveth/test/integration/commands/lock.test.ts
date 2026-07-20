import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { GIVPOWER_LM } from "../../fixtures";

const givpowerAbi = parseAbi(["function lock(uint256 amount, uint256 rounds)"]);

describeCommand("lock", {
  describeName: "Giveth > commands > lock <amount> <rounds>",
  module: "giveth",
  preamble: "load giveth",
  cases: [
    {
      name: "locks staked GIV on the GIVpower contract",
      script: "giveth:lock 100e18 26",
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const lock = actions[0] as any;
        expect(lock.to).to.eq(GIVPOWER_LM);
        const { functionName, args } = decodeFunctionData({
          abi: givpowerAbi,
          data: lock.data,
        });
        expect(functionName).to.eq("lock");
        expect(args).to.eql([100n * 10n ** 18n, 26n]);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on chains without a GIVpower deployment",
      script: "switch mainnet\ngiveth:lock 100e18 1",
      error: "GIVpower is not deployed on chain 1",
    },
    {
      name: "should fail on a zero amount",
      script: "giveth:lock 0 1",
      error: "greater than zero",
    },
    {
      name: "should fail on zero rounds",
      script: "giveth:lock 100e18 0",
      error: "<rounds> must be greater than zero",
    },
  ],
  docCases: [
    {
      description:
        "Lock 100 staked GIV for 26 rounds (a year) to multiply its GIVpower",
      code: "giveth:lock 100e18 26",
    },
  ],
});
