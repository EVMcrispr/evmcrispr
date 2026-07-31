import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  AAVE_POOL,
  SOME_ADDRESS,
  SPARK_POOL,
  WXDAI,
  ZERO_ADDRESS,
} from "../../fixtures";

const poolAbi = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const AMOUNT = 100n * 10n ** 18n;

function decodeSupply(action: any) {
  return decodeFunctionData({ abi: poolAbi, data: action.data });
}

describeCommand("supply", {
  describeName: "Lending > commands > supply <amount> <token>",
  module: "lending",
  preamble: "load lending",
  cases: [
    {
      name: "supplies a token with auto-approve to the pool",
      script: `lending:supply 100e18 ${WXDAI}`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [approve, supply] = actions as any[];

        expect(approve.to).to.eq(WXDAI);
        const { args: approvalArgs = [] } = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approvalArgs).to.eql([AAVE_POOL, AMOUNT]);

        expect(supply.to).to.eq(AAVE_POOL);
        const { functionName, args = [] } = decodeSupply(supply);
        expect(functionName).to.eq("supply");
        expect(args[0]).to.eq(WXDAI);
        expect(args[1]).to.eq(AMOUNT);
        expect((args[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect(args[3]).to.eq(0);
      },
    },
    {
      name: "skips the approve action with --no-approve true",
      script: `lending:supply 100e18 ${WXDAI} --no-approve true`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        expect((actions[0] as any).to).to.eq(AAVE_POOL);
      },
    },
    {
      name: "credits --on-behalf-of with the supplied position",
      script: `lending:supply 100e18 ${WXDAI} --on-behalf-of ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args = [] } = decodeSupply(actions.at(-1));
        expect(args[2]).to.eq(SOME_ADDRESS);
      },
    },
    {
      name: "accepts an explicit --using AaveV3",
      script: `lending:supply 100e18 ${WXDAI} --using AaveV3`,
      validate: (actions) => {
        expect((actions.at(-1) as any).to).to.eq(AAVE_POOL);
      },
    },
    {
      name: "targets the SparkLend pool with --using Spark",
      script: `lending:supply 100e18 ${WXDAI} --using Spark`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [approve, supply] = actions as any[];
        const { args: approvalArgs = [] } = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approvalArgs).to.eql([SPARK_POOL, AMOUNT]);
        expect(supply.to).to.eq(SPARK_POOL);
        const { functionName } = decodeSupply(supply);
        expect(functionName).to.eq("supply");
      },
    },
    {
      name: "runs a full supply/borrow/repay-max/withdraw-max lifecycle inside sim:fork",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 20000e18
  exec ${WXDAI} deposit() --value 10000e18
  lending:supply 5000e18 ${WXDAI}
  lending:borrow 1000e18 ${WXDAI}
  sim:expect @bool(@lending:healthFactor(@me) >= 1.4e18)
  sim:expect @bool(@lending:debt(@me ${WXDAI}) >= 1000e18)
  lending:repay max ${WXDAI}
  sim:expect @bool(@lending:debt(@me ${WXDAI}) == 0)
  lending:withdraw max ${WXDAI}
  exec ${WXDAI} approve(address,uint256) ${AAVE_POOL} 0
)`,
      validate: () => {
        // Reaching this point means every Aave call (approve, supply,
        // borrow, repay max, withdraw max) executed on the fork without
        // reverting and the health-factor/debt expectations held.
      },
    },
  ],
  errorCases: [
    {
      name: "should fail with an unknown adapter",
      script: `lending:supply 100e18 ${WXDAI} --using Compound`,
      error: "must be one of AaveV3",
    },
    {
      name: "should reject adapters without a deployment on the chain",
      script: `lending:supply 100e18 ${WXDAI} --using CompoundV3`,
      error: "CompoundV3 is not available on Gnosis",
    },
    {
      name: "should fail on a zero amount",
      script: `lending:supply 0 ${WXDAI}`,
      error: "greater than zero",
    },
    {
      name: "should point native-token supplies at swaps:wrap",
      script: `lending:supply 100e18 ${ZERO_ADDRESS}`,
      error: "wrap the native token first",
    },
    {
      name: "should fail on tokens not listed on the market",
      script: `lending:supply 100e18 ${SOME_ADDRESS}`,
      error: "not listed on AaveV3",
    },
  ],
  docCases: [
    {
      description: "Supply 100 WXDAI to Aave v3 on Gnosis (auto-approves)",
      code: "lending:supply 100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
    },
    {
      description: "Supply on behalf of another account",
      code: "lending:supply 100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d --on-behalf-of 0x4F2083f5fBede34C2714aFfb3105539775f7FE64",
    },
    {
      description: "Supply to SparkLend instead of the default market",
      code: "lending:supply 100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d --using Spark",
    },
  ],
});
