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
 * the Int path through the operand layer rather than the Uint one — and the
 * GDA reads below use negative flow rates on purpose for that reason.
 *
 * The pool reads live in parity-gda.test.ts, against a pool built on the fork
 * rather than a mock — mocking them here replaced the GDA forwarder, which
 * these netflow and flow cases also read, and broke them.
 */

/** Stands in for an ISuperfluidPool. */

describeParity("@superfluid", {
  module: "superfluid",
  helpers,
  cases: [
    {
      // Reads the real CFA forwarder — it needs no stream, just a token and a
      // rate, so it works live.
      name: "buffer for a monthly rate",
      run: `@superfluid:buffer(${XDAIX} 1000e18/mo)`,
      compile: `@superfluid:buffer!(${XDAIX} 1000e18/mo)`,
    },
    {
      // The plain face accepts a zero rate and answers zero; the ! face
      // refuses it at composition time, because parseFlowRate guards against
      // a tiny rate flooring to 0 wei/second. Pinned rather than smoothed
      // over: the two faces disagree about what is a valid argument.
      name: "refuses: a zero flowrate, which the plain face accepts",
      run: `@superfluid:buffer(${XDAIX} 0)`,
      compile: `@superfluid:buffer!(${XDAIX} 0)`,
      helper: "buffer",
      refuses: /must be greater than zero/,
    },
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
