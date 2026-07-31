import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";

// The ended-lock scenario (lock → wait past the round → unlockable shows the
// freed amount) runs on a fork in unstakable.test.ts, which asserts the whole
// helper family across the lock lifecycle.
describeHelper("@giveth:unlockable", {
  module: "giveth",
  cases: [
    {
      name: "returns 0 for an account with no ended locks",
      input: `@giveth:unlockable(${TEST_ACCOUNT_ADDRESS})`,
      validate: (result) => {
        expect((result as any).toBigInt()).to.eq(0n);
      },
    },
  ],
  docCases: [
    {
      description: "Print the GIV a giveth:unlock would free",
      code: 'print "Unlockable GIV:" @giveth:unlockable()',
    },
  ],
});

describeHelper("@giveth:unlockable", {
  describeName: "Giveth > helpers > @giveth:unlockable > other chains",
  module: "giveth",
  preamble: "switch mainnet",
  skipArgLengthCheck: true,
  cases: [],
  errorCases: [
    {
      name: "fails on chains without a GIVpower deployment",
      input: "@giveth:unlockable()",
      error: "GIVpower is not deployed on Ethereum",
    },
  ],
});
