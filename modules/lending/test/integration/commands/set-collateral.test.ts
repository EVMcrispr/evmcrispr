import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { AAVE_POOL, SOME_ADDRESS, WXDAI } from "../../fixtures";

const poolAbi = parseAbi([
  "function setUserUseReserveAsCollateral(address asset, bool useAsCollateral)",
]);

function decodeSetCollateral(action: any) {
  return decodeFunctionData({ abi: poolAbi, data: action.data });
}

describeCommand("set-collateral", {
  describeName: "Lending > commands > set-collateral <token> <on|off>",
  module: "lending",
  preamble: "load lending",
  cases: [
    {
      name: "enables a supplied token as collateral with `on`",
      script: `lending:set-collateral ${WXDAI} on`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect(action.to).to.eq(AAVE_POOL);
        const { functionName, args } = decodeSetCollateral(action);
        expect(functionName).to.eq("setUserUseReserveAsCollateral");
        expect(args).to.eql([WXDAI, true]);
      },
    },
    {
      name: "disables collateral with `off`",
      script: `lending:set-collateral ${WXDAI} off`,
      validate: (actions) => {
        const { args } = decodeSetCollateral(actions[0]);
        expect(args).to.eql([WXDAI, false]);
      },
    },
  ],
  errorCases: [
    {
      name: "should reject modes other than on/off",
      script: `lending:set-collateral ${WXDAI} maybe`,
      error: "must be `on` or `off`",
    },
    {
      name: "should fail on tokens not listed on the market",
      script: `lending:set-collateral ${SOME_ADDRESS} on`,
      error: "not listed on AaveV3",
    },
  ],
  docCases: [
    {
      description: "Stop using GNO as collateral on Aave v3 (Gnosis)",
      code: "lending:set-collateral 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb off",
    },
  ],
});
