import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

/**
 * @vault's ERC-4626 reads, against sDAI on Gnosis.
 *
 * The plain ERC-4626 surface is covered by value. The ERC-7540 async surface
 * (`@pendingDeposit`, `@claimableRedeem`, `@share`, `@isOperator`) needs a
 * vault implementing it, and sDAI does not, so those stay uncovered rather
 * than being pinned against a mock that would only pin the mock.
 */

/** Savings xDAI: a real ERC-4626 whose asset is WXDAI. */
const SDAI = "0xaf204776c7245bF4147c2612BF6e5972Ee483701";
const HOLDER = "0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533";
const ONE = "1000000000000000000";

describeParity("@vault", {
  module: "vault",
  helpers,
  cases: [
    {
      name: "asset resolves the underlying token",
      run: `@vault:asset(${SDAI})`,
      compile: `@vault:asset!(${SDAI})`,
    },
    {
      name: "totalAssets reads the vault's holdings",
      run: `@vault:totalAssets(${SDAI})`,
      compile: `@vault:totalAssets!(${SDAI})`,
    },
    {
      name: "convertToAssets prices shares in the underlying",
      run: `@vault:convertToAssets(${SDAI} ${ONE})`,
      compile: `@vault:convertToAssets!(${SDAI} ${ONE})`,
    },
    {
      name: "convertToShares prices the underlying in shares",
      run: `@vault:convertToShares(${SDAI} ${ONE})`,
      compile: `@vault:convertToShares!(${SDAI} ${ONE})`,
    },
    {
      name: "maxWithdraw reads an account's withdrawable balance",
      run: `@vault:maxWithdraw(${SDAI} ${HOLDER})`,
      compile: `@vault:maxWithdraw!(${SDAI} ${HOLDER})`,
    },
  ],
});
