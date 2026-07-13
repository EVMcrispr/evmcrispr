import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS, WXDAI } from "../../fixtures";

describeHelper("@lending:apy", {
  module: "lending",
  cases: [
    {
      name: "returns the WXDAI supply APY as a decimal fraction",
      input: `@lending:apy(${WXDAI} supply)`,
      validate: (result) => {
        const apy = Number(result);
        // WXDAI earns interest at the pinned block (~2% APR).
        expect(apy).to.be.greaterThan(0);
        expect(apy).to.be.lessThan(1);
      },
    },
    {
      name: "quotes the borrow side above the supply side",
      input: `@lending:apy(${WXDAI} borrow)`,
      validate: (result) => {
        const apy = Number(result);
        // WXDAI borrows cost ~3.8% APR at the pinned block.
        expect(apy).to.be.greaterThan(0.001);
        expect(apy).to.be.lessThan(1);
      },
    },
  ],
  errorCases: [
    {
      name: "should reject sides other than supply/borrow",
      input: `@lending:apy(${WXDAI} sideways)`,
      error: "must be `supply` or `borrow`",
    },
    {
      name: "should fail on tokens not listed on the market",
      input: `@lending:apy(${SOME_ADDRESS} supply)`,
      error: "not listed on AaveV3",
    },
  ],
  docCases: [
    {
      description: "Print the WXDAI deposit APY (0.02 means 2%)",
      code: 'print "WXDAI supply APY:" @lending:apy(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d supply)',
    },
    {
      description: "Print the variable borrow APY",
      code: 'print "WXDAI borrow APY:" @lending:apy(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d borrow)',
    },
  ],
});
