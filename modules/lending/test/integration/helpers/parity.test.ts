import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";
import { SOME_ADDRESS, WXDAI } from "../../fixtures";

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
  ],
});
