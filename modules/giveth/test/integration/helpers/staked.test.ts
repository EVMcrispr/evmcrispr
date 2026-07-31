import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";

describeHelper("@giveth:staked", {
  module: "giveth",
  cases: [
    {
      name: "returns 0 for an account that never staked",
      input: `@giveth:staked(${TEST_ACCOUNT_ADDRESS})`,
      validate: (result) => {
        expect((result as any).toBigInt()).to.eq(0n);
      },
    },
  ],
  docCases: [
    {
      description: "Print your staked GIV",
      code: 'print "Staked GIV:" @giveth:staked()',
    },
  ],
});

describeHelper("@giveth:staked", {
  describeName: "Giveth > helpers > @giveth:staked > other chains",
  module: "giveth",
  preamble: "switch mainnet",
  skipArgLengthCheck: true,
  cases: [],
  errorCases: [
    {
      name: "fails on chains without a GIVpower deployment",
      input: "@giveth:staked()",
      error: "GIVpower is not deployed on Ethereum",
    },
  ],
});
