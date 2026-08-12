import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { AAVE_POOL, SOME_ADDRESS, WXDAI } from "../../fixtures";

const poolAbi = parseAbi([
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
]);

function decodeBorrow(action: any) {
  return decodeFunctionData({ abi: poolAbi, data: action.data });
}

describeCommand("borrow", {
  describeName: "Lending > commands > borrow <amount> <token>",
  module: "lending",
  preamble: "load lending",
  cases: [
    {
      name: "borrows at variable rate with no referral",
      script: `lending:borrow 100e18 ${WXDAI}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect(action.to).to.eq(AAVE_POOL);
        const { functionName, args = [] } = decodeBorrow(action);
        expect(functionName).to.eq("borrow");
        expect(args[0]).to.eq(WXDAI);
        expect(args[1]).to.eq(100n * 10n ** 18n);
        expect(args[2]).to.eq(2n); // variable rate
        expect(args[3]).to.eq(0);
        expect((args[4] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "borrows against delegated credit with --on-behalf-of",
      script: `lending:borrow 100e18 ${WXDAI} --on-behalf-of ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args = [] } = decodeBorrow(actions[0]);
        expect(args[4]).to.eq(SOME_ADDRESS);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on a zero amount",
      script: `lending:borrow 0 ${WXDAI}`,
      error: "greater than zero",
    },
    {
      name: "should fail on tokens not listed on the market",
      script: `lending:borrow 100e18 ${SOME_ADDRESS}`,
      error: "not listed on AaveV3",
    },
  ],
  docCases: [
    {
      description: "Borrow 50 WXDAI at variable rate on Aave v3 (Gnosis)",
      code: "lending:borrow 50e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
    },
  ],
});
