import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, maxUint256, parseAbi } from "viem";
import { AAVE_POOL, SOME_ADDRESS, WXDAI, ZERO_ADDRESS } from "../../fixtures";

const poolAbi = parseAbi([
  "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
]);

function decodeWithdraw(action: any) {
  return decodeFunctionData({ abi: poolAbi, data: action.data });
}

describeCommand("withdraw", {
  describeName: "Lending > commands > withdraw <amount|max> <token>",
  module: "lending",
  preamble: "load lending",
  cases: [
    {
      name: "withdraws an explicit amount to the connected account",
      script: `lending:withdraw 50e18 ${WXDAI}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect(action.to).to.eq(AAVE_POOL);
        const { functionName, args = [] } = decodeWithdraw(action);
        expect(functionName).to.eq("withdraw");
        expect(args[0]).to.eq(WXDAI);
        expect(args[1]).to.eq(50n * 10n ** 18n);
        expect((args[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "encodes `max` as uint256.max so the pool burns the full balance",
      script: `lending:withdraw max ${WXDAI}`,
      validate: (actions) => {
        const { args = [] } = decodeWithdraw(actions[0]);
        expect(args[1]).to.eq(maxUint256);
      },
    },
    {
      name: "sends the withdrawn tokens to --to when given",
      script: `lending:withdraw 50e18 ${WXDAI} --to ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args = [] } = decodeWithdraw(actions[0]);
        expect(args[2]).to.eq(SOME_ADDRESS);
      },
    },
  ],
  errorCases: [
    {
      name: "should reject barewords other than `max`",
      script: `lending:withdraw everything ${WXDAI}`,
      error: "must be a number or the keyword `max`",
    },
    {
      name: "should reject the native token",
      script: `lending:withdraw 50e18 ${ZERO_ADDRESS}`,
      error: "wrap the native token first",
    },
  ],
  docCases: [
    {
      description: "Withdraw 50 WXDAI from Aave v3 on Gnosis",
      code: "lending:withdraw 50e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
    },
    {
      description: "Withdraw the full WXDAI balance, accrued interest included",
      code: "lending:withdraw max 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
    },
  ],
});
