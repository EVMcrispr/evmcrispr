import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";
import { SOME_ADDRESS, WXDAI } from "../../fixtures";

/** An Aave v3 Gnosis account holding WXDAI collateral at the fork block
 *  (nonzero availableBorrowsBase), so the live maxBorrow path divides a
 *  real headroom by a real oracle price. */
const DEPOSITOR = "0x3D2147ba81A66CD91B92345674E36460D0647bC0";

/**
 * @lending's adapter-dispatched reads, against Aave v3 on Gnosis.
 *
 * `@apy` is the case worth having: both faces run the SAME binary
 * exponentiation with the unit divided back out at each step, deliberately, so
 * that they agree to the last unit rather than being close. Off-chain that is
 * `compoundToApy`; on-chain it is `rpow` through Operators. If either side
 * ever drifts to floating point or to a different unit, this is what says so.
 */

describeParity("@lending", {
  module: "lending",
  helpers,
  cases: [
    {
      name: "supply apy compounds the same way on both faces",
      run: `@lending:apy(${WXDAI} supply)`,
      compile: `@lending:apy!(${WXDAI} supply)`,
    },
    {
      name: "borrow apy compounds the same way on both faces",
      run: `@lending:apy(${WXDAI} borrow)`,
      compile: `@lending:apy!(${WXDAI} borrow)`,
    },
    {
      name: "debt of an account with no position is zero on both faces",
      run: `@lending:debt(${SOME_ADDRESS} ${WXDAI})`,
      compile: `@lending:debt!(${SOME_ADDRESS} ${WXDAI})`,
    },
    {
      name: "health factor of an account with no position",
      run: `@lending:healthFactor(${SOME_ADDRESS})`,
      compile: `@lending:healthFactor!(${SOME_ADDRESS})`,
    },
    {
      name: "maxBorrow of an account with no collateral is zero on both faces",
      run: `@lending:maxBorrow(${SOME_ADDRESS} ${WXDAI})`,
      compile: `@lending:maxBorrow!(${SOME_ADDRESS} ${WXDAI})`,
    },
    {
      // A real depositor at the pinned fork block: both faces divide the
      // base-currency headroom by the same oracle price at the same
      // block, so the answers match exactly, price division included.
      name: "maxBorrow of a live depositor",
      run: `@lending:maxBorrow(${DEPOSITOR} ${WXDAI})`,
      compile: `@lending:maxBorrow!(${DEPOSITOR} ${WXDAI})`,
    },
  ],
});
