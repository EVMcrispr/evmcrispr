import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";
import { RECEIVER, SOME_ADDRESS, USDCX, XDAIX } from "../../fixtures";

/**
 * @superfluid's stream reads, against the live Gnosis deployment.
 *
 * These are the faces where the two routes differ most: off-chain the module
 * reads through the CFA/GDA forwarders with viem, on-chain it staticcalls them
 * from the assertion. `@netflow` in particular has two shapes upstream
 * (`getAccountFlowrate` and `getNetFlow`), so agreeing means both faces picked
 * the same one.
 *
 * Signed values matter here: a net flow is negative for a net sender, which is
 * the Int path through the operand layer rather than the Uint one.
 */

describeParity("@superfluid", {
  module: "superfluid",
  helpers,
  cases: [
    {
      name: "underlying resolves a wrapper SuperToken's asset",
      run: `@superfluid:underlying(${USDCX})`,
      compile: `@superfluid:underlying!(${USDCX})`,
    },
    {
      name: "balance of an account with no SuperToken position",
      run: `@superfluid:balance(${XDAIX} ${SOME_ADDRESS})`,
      compile: `@superfluid:balance!(${XDAIX} ${SOME_ADDRESS})`,
    },
    {
      name: "netflow of an account with no streams is zero",
      run: `@superfluid:netflow(${XDAIX} ${SOME_ADDRESS})`,
      compile: `@superfluid:netflow!(${XDAIX} ${SOME_ADDRESS})`,
    },
    {
      name: "flow between two accounts with no stream is zero",
      run: `@superfluid:flow(${XDAIX} ${SOME_ADDRESS} ${RECEIVER})`,
      compile: `@superfluid:flow!(${XDAIX} ${SOME_ADDRESS} ${RECEIVER})`,
    },
  ],
});
