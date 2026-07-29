import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS, WXDAI } from "../../fixtures";

describeHelper("@lending:debt", {
  module: "lending",
  cases: [
    {
      name: "returns 0 for an account without debt",
      input: `@lending:debt(${SOME_ADDRESS} ${WXDAI})`,
      expected: "0",
    },
    {
      name: "reads through the Spark market when selected",
      input: `@lending:debt(${SOME_ADDRESS} ${WXDAI} Spark)`,
      expected: "0",
    },
  ],
  errorCases: [
    {
      name: "should fail on tokens not listed on the market",
      input: `@lending:debt(${SOME_ADDRESS} ${SOME_ADDRESS})`,
      error: "not listed on AaveV3",
    },
  ],
  docCases: [
    {
      description: "Print the connected account's variable WXDAI debt",
      code: 'print "WXDAI debt:" @lending:debt(@me 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)',
    },
  ],
});
