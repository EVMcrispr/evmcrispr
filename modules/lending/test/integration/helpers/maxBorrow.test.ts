import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS, WXDAI } from "../../fixtures";

describeHelper("@lending:maxBorrow", {
  module: "lending",
  cases: [
    {
      name: "returns 0 for an account without collateral",
      input: `@lending:maxBorrow(${SOME_ADDRESS} ${WXDAI})`,
      expected: "0",
    },
  ],
  errorCases: [
    {
      name: "should fail on tokens not listed on the market",
      input: `@lending:maxBorrow(${SOME_ADDRESS} ${SOME_ADDRESS})`,
      error: "not listed on AaveV3",
    },
  ],
  docCases: [
    {
      description:
        "Print how much WXDAI the connected account can still borrow",
      code: 'print "Can still borrow:" @lending:maxBorrow(@me 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)',
    },
  ],
});
