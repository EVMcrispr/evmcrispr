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
    {
      name: "does nothing on a zero amount",
      script: "giveth:lock 0 26",
      validate: (actions) => {
        expect(actions).to.have.length(0);
      },
    },
    {
      name: "resolves `max` against pending stakes earlier in the script",
      // The test account has nothing staked on-chain; `max` must count the
      // pending 500 GIV stake collected just before.
      script: "giveth:stake 500e18 --no-approve true\ngiveth:lock max 26",
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const lock = actions[1] as any;
        expect(lock.to).to.eq(GIVPOWER_LM);
        const { functionName, args } = decodeFunctionData({
          abi: givpowerAbi,
          data: lock.data,
        });
        expect(functionName).to.eq("lock");
        expect(args).to.eql([500n * 10n ** 18n, 26n]);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on chains without a GIVpower deployment",
      script: "switch mainnet\ngiveth:lock 100e18 1",
      error: "GIVpower is not deployed on Ethereum",
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
    {
      description: "Lock all staked GIV that is not already locked",
      code: "giveth:lock max 26",
    },
  ],
});
