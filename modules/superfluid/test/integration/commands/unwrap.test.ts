import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { USDCX, XDAIX } from "../../fixtures";

const superTokenAbi = parseAbi([
  "function downgrade(uint256 amount)",
  "function downgradeToETH(uint256 wad)",
]);

describeCommand("unwrap", {
  describeName: "Superfluid > commands > unwrap <amount> of <supertoken>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "unwraps a native SuperToken via downgradeToETH",
      script: `superfluid:unwrap 100e18 of ${XDAIX}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const { functionName, args } = decodeFunctionData({
          abi: superTokenAbi,
          data: (actions[0] as any).data,
        });
        expect(functionName).to.eq("downgradeToETH");
        expect(args?.[0]).to.eq(100n * 10n ** 18n);
      },
    },
    {
      name: "unwraps a wrapper SuperToken via downgrade (18-decimal amount)",
      script: `superfluid:unwrap 100e18 of ${USDCX}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const { functionName, args } = decodeFunctionData({
          abi: superTokenAbi,
          data: (actions[0] as any).data,
        });
        expect(functionName).to.eq("downgrade");
        expect(args?.[0]).to.eq(100n * 10n ** 18n);
      },
    },
    {
      name: "wraps then unwraps max on a fork",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 2000e18
  superfluid:wrap 1000e18 into xDAIx
  sim:expect @bool(@superfluid:balance(xDAIx) == 1000e18)
  superfluid:unwrap max of xDAIx
  sim:expect @bool(@superfluid:balance(xDAIx) == 0)
)`,
      validate: () => {
        // Reaching this point means wrap, unwrap max and both balance
        // expectations executed on the fork without reverting.
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on a zero amount",
      script: `superfluid:unwrap 0 of ${XDAIX}`,
      error: "greater than zero",
    },
    {
      name: "should reject a wrong keyword",
      script: `superfluid:unwrap 100e18 from ${XDAIX}`,
      error: 'expected keyword "of"',
    },
  ],
  docCases: [
    {
      description: "Unwrap 50 xDAIx back to native xDAI",
      code: "superfluid:unwrap 50e18 of xDAIx",
    },
    {
      description:
        "Wrap and later exit completely with `max`, previewed inside a fork simulation",
      code: `load sim

sim:fork --using anvil (
  sim:set-balance @me 200e18
  superfluid:wrap 100e18 into xDAIx
  superfluid:unwrap max of xDAIx
)`,
      preamble: "load superfluid",
    },
  ],
});
