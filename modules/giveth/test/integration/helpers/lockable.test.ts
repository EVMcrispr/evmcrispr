import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";

describeHelper("@giveth:lockable", {
  module: "giveth",
  cases: [
    {
      name: "returns 0 for an account that never staked",
      input: `@giveth:lockable(${TEST_ACCOUNT_ADDRESS})`,
      validate: (result) => {
        expect((result as any).toBigInt()).to.eq(0n);
      },
    },
  ],
  docCases: [
    {
      description: "Print the staked GIV you could lock right now",
      code: 'print "Lockable GIV:" @giveth:lockable()',
    },
  ],
});

describeHelper("@giveth:lockable", {
  describeName: "Giveth > helpers > @giveth:lockable > virtual accounting",
  module: "giveth",
  // Nothing is staked on-chain; the pending stake and lock must both count.
  preamble: "giveth:stake 500e18 --no-approve true\ngiveth:lock 200e18 26",
  skipArgLengthCheck: true,
  cases: [
    {
      name: "counts pending stakes and locks earlier in the script",
      input: "@giveth:lockable()",
      validate: (result) => {
        expect((result as any).toBigInt()).to.eq(300n * 10n ** 18n);
      },
    },
  ],
});

describeHelper("@giveth:lockable", {
  describeName: "Giveth > helpers > @giveth:lockable > other chains",
  module: "giveth",
  preamble: "switch mainnet",
  skipArgLengthCheck: true,
  cases: [],
  errorCases: [
    {
      name: "fails on chains without a GIVpower deployment",
      input: "@giveth:lockable()",
      error: "GIVpower is not deployed on Ethereum",
    },
  ],
});
