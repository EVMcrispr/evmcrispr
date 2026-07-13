import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { RATE_1000_PER_MONTH, XDAIX } from "../../fixtures";

describeHelper("@superfluid:buffer", {
  module: "superfluid",
  cases: [
    {
      name: "returns the buffer for a rate (4h of streaming on Gnosis, clipped to deposit granularity)",
      input: `@superfluid:buffer(${XDAIX} 1000e18/mo)`,
      validate: (result) => {
        // The CFA rounds deposits up to 2^32 wei granularity.
        const raw = RATE_1000_PER_MONTH * 14400n;
        const clipped = ((raw + 2n ** 32n - 1n) >> 32n) << 32n;
        expect(BigInt(String(result))).to.eq(clipped);
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a zero rate",
      input: `@superfluid:buffer(${XDAIX} 0)`,
      error: "greater than zero",
    },
  ],
  docCases: [
    {
      description:
        "Print the deposit that opening a 1000 xDAIx/month stream would lock",
      code: `print "Buffer:" @superfluid:buffer(xDAIx 1000e18/mo)`,
    },
  ],
});
