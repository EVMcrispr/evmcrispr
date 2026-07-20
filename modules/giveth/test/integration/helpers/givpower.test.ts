import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS } from "../../fixtures";

describeHelper("@giveth:givpower", {
  module: "giveth",
  cases: [
    {
      name: "returns 0 for an account that never staked",
      input: `@giveth:givpower(${SOME_ADDRESS})`,
      validate: (result) => {
        expect(String(result)).to.eq("0");
      },
    },
    {
      name: "defaults to the connected account",
      input: "@giveth:givpower()",
      validate: (result) => {
        expect(String(result)).to.eq("0");
      },
    },
  ],
  docCases: [
    {
      description: "Print your GIVpower balance",
      code: 'print "GIVpower:" @giveth:givpower()',
    },
  ],
});

describeHelper("@giveth:givpower", {
  describeName: "Giveth > helpers > @giveth:givpower > unsupported chains",
  module: "giveth",
  preamble: "switch mainnet",
  skipArgLengthCheck: true,
  cases: [],
  errorCases: [
    {
      name: "fails on chains without a GIVpower deployment",
      input: "@giveth:givpower()",
      error: "GIVpower is not deployed on chain 1",
    },
  ],
});
