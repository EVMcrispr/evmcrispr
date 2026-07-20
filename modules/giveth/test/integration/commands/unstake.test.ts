import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { GARDEN, GIVPOWER_LM_OPTIMISM } from "../../fixtures";

const stakingAbi = parseAbi([
  "function unwrap(uint256 amount)",
  "function withdraw(uint256 amount)",
]);

const AMOUNT = 100n * 10n ** 18n;

describeCommand("unstake", {
  describeName: "Giveth > commands > unstake <amount|max>",
  module: "giveth",
  preamble: "load giveth",
  cases: [
    {
      name: "unwraps gGIV from the GIVgarden on Gnosis",
      script: "giveth:unstake 100e18",
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const unwrap = actions[0] as any;
        expect(unwrap.to).to.eq(GARDEN);
        const { functionName, args } = decodeFunctionData({
          abi: stakingAbi,
          data: unwrap.data,
        });
        expect(functionName).to.eq("unwrap");
        expect(args).to.eql([AMOUNT]);
      },
    },
    {
      name: "resolves `max` to the full staked balance",
      script: "giveth:unstake max",
      validate: (actions) => {
        // The test account has nothing staked at the pinned block, so max
        // resolves to zero — the point is that the read path works.
        expect(actions).to.have.length(1);
        const { functionName, args } = decodeFunctionData({
          abi: stakingAbi,
          data: (actions[0] as any).data,
        });
        expect(functionName).to.eq("unwrap");
        expect(args).to.eql([0n]);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on chains without a GIVpower deployment",
      script: "switch mainnet\ngiveth:unstake 100e18",
      error: "GIVpower is not deployed on chain 1",
    },
    {
      name: "should fail on a zero amount",
      script: "giveth:unstake 0",
      error: "greater than zero",
    },
  ],
  docCases: [
    {
      description: "Unstake 100 GIV from GIVpower",
      code: "giveth:unstake 100e18",
    },
    {
      description: "Unstake everything that is not locked",
      code: "giveth:unstake max",
    },
  ],
});

describeCommand("unstake", {
  describeName: "Giveth > commands > unstake > unipool flavor (Optimism)",
  module: "giveth",
  preamble: "load giveth\nswitch optimism",
  cases: [
    {
      name: "withdraws GIV from the UnipoolGIVpower contract",
      script: "giveth:unstake 100e18",
      validate: (actions) => {
        const txs = (actions as any[]).filter((a) => a.data);
        expect(txs).to.have.length(1);
        expect(txs[0].to).to.eq(GIVPOWER_LM_OPTIMISM);
        const { functionName, args } = decodeFunctionData({
          abi: stakingAbi,
          data: txs[0].data,
        });
        expect(functionName).to.eq("withdraw");
        expect(args).to.eql([AMOUNT]);
      },
    },
  ],
});
