import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";

describeHelper("@giveth:stakable", {
  module: "giveth",
  cases: [
    {
      name: "returns 0 for an account with no GIV",
      input: `@giveth:stakable(${TEST_ACCOUNT_ADDRESS})`,
      validate: (result) => {
        expect((result as any).toBigInt()).to.eq(0n);
      },
    },
  ],
  docCases: [
    {
      description: "Print the GIV you could stake right now",
      code: 'print "Stakable GIV:" @giveth:stakable()',
    },
  ],
});

describeHelper("@giveth:stakable", {
  describeName: "Giveth > helpers > @giveth:stakable > virtual accounting",
  module: "giveth",
  // The test account holds no GIV; the pending unstake credits its virtual
  // wallet balance.
  preamble: "giveth:unstake 100e18",
  skipArgLengthCheck: true,
  cases: [
    {
      name: "counts pending unstakes earlier in the script",
      input: "@giveth:stakable()",
      validate: (result) => {
        expect((result as any).toBigInt()).to.eq(100n * 10n ** 18n);
      },
    },
  ],
});

describeHelper("@giveth:stakable", {
  describeName: "Giveth > helpers > @giveth:stakable > other chains",
  module: "giveth",
  preamble: "switch mainnet",
  skipArgLengthCheck: true,
  cases: [],
  errorCases: [
    {
      name: "fails on chains without a GIVpower deployment",
      input: "@giveth:stakable()",
      error: "GIVpower is not deployed on chain 1",
    },
  ],
});
