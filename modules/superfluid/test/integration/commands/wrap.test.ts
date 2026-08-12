import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { SOME_ADDRESS, USDC, USDCX, XDAIX } from "../../fixtures";

const superTokenAbi = parseAbi([
  "function upgrade(uint256 amount)",
  "function upgradeByETH() payable",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

describeCommand("wrap", {
  describeName: "Superfluid > commands > wrap <amount> into <supertoken>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "wraps the native token via payable upgradeByETH",
      script: `superfluid:wrap 100e18 into ${XDAIX}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(XDAIX.toLowerCase());
        expect(action.value).to.eq(100n * 10n ** 18n);
        const { functionName } = decodeFunctionData({
          abi: superTokenAbi,
          data: action.data,
        });
        expect(functionName).to.eq("upgradeByETH");
      },
    },
    {
      name: "wraps an ERC-20 underlying with auto-approve, scaling 6-decimal amounts to 18",
      script: `superfluid:wrap 100e6 into ${USDCX}`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [approve, upgrade] = actions as any[];

        expect((approve.to as string).toLowerCase()).to.eq(USDC.toLowerCase());
        const { args: approvalArgs = [] } = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect((approvalArgs[0] as string).toLowerCase()).to.eq(
          USDCX.toLowerCase(),
        );
        // allowance covers the 6-decimal underlying amount
        expect(approvalArgs[1]).to.eq(100n * 10n ** 6n);

        expect((upgrade.to as string).toLowerCase()).to.eq(USDCX.toLowerCase());
        const decoded = decodeFunctionData({
          abi: superTokenAbi,
          data: upgrade.data,
        });
        expect(decoded.functionName).to.eq("upgrade");
        // upgrade() takes the 18-decimal SuperToken amount
        expect(decoded.args?.[0]).to.eq(100n * 10n ** 18n);
      },
    },
    {
      name: "skips the approve action with --no-approve true",
      script: `superfluid:wrap 100e6 into ${USDCX} --no-approve true`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on a zero amount",
      script: `superfluid:wrap 0 into ${XDAIX}`,
      error: "greater than zero",
    },
    {
      name: "should reject a wrong keyword",
      script: `superfluid:wrap 100e18 to ${XDAIX}`,
      error: 'expected keyword "into"',
    },
    {
      name: "should fail on addresses that are not SuperTokens",
      script: `superfluid:wrap 100e18 into ${SOME_ADDRESS}`,
      error: "does not look like a SuperToken",
    },
  ],
  docCases: [
    {
      description:
        "Wrap 100 native xDAI into xDAIx on Gnosis (no approval needed)",
      code: "superfluid:wrap 100e18 into xDAIx",
    },
    {
      description:
        "Wrap 100 USDC (6 decimals) into USDCx — the amount is in the underlying's base units and the approval is inserted automatically",
      code: "superfluid:wrap 100e6 into USDCx",
    },
  ],
});
