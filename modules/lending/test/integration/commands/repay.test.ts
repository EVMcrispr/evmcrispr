import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { AAVE_POOL, SOME_ADDRESS, WXDAI } from "../../fixtures";

const poolAbi = parseAbi([
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

function decodeRepay(action: any) {
  return decodeFunctionData({ abi: poolAbi, data: action.data });
}

describeCommand("repay", {
  describeName: "Lending > commands > repay <amount|max> <token>",
  module: "lending",
  preamble: "load lending",
  cases: [
    {
      name: "repays an explicit amount with an exact auto-approve",
      script: `lending:repay 100e18 ${WXDAI}`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [approve, repay] = actions as any[];

        expect(approve.to).to.eq(WXDAI);
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approval.args).to.eql([AAVE_POOL, 100n * 10n ** 18n]);

        expect(repay.to).to.eq(AAVE_POOL);
        const { functionName, args } = decodeRepay(repay);
        expect(functionName).to.eq("repay");
        expect(args?.[0]).to.eq(WXDAI);
        expect(args?.[1]).to.eq(100n * 10n ** 18n);
        expect(args?.[2]).to.eq(2n); // variable rate
        expect((args?.[3] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "skips the approve action with --no-approve true",
      script: `lending:repay 100e18 ${WXDAI} --no-approve true`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        expect((actions[0] as any).to).to.eq(AAVE_POOL);
      },
    },
  ],
  errorCases: [
    {
      name: "should reject `max` when the account has no variable debt",
      script: `lending:repay max ${WXDAI}`,
      error: "no variable",
    },
    {
      name: "should reject `max` combined with --on-behalf-of",
      script: `lending:repay max ${WXDAI} --on-behalf-of ${SOME_ADDRESS}`,
      error: "does not accept `max` together with --on-behalf-of",
    },
    {
      name: "should reject barewords other than `max`",
      script: `lending:repay everything ${WXDAI}`,
      error: "must be a number or the keyword `max`",
    },
  ],
  docCases: [
    {
      description: "Repay 50 WXDAI of variable-rate debt on Aave v3 (Gnosis)",
      code: "lending:repay 50e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
    },
  ],
});
