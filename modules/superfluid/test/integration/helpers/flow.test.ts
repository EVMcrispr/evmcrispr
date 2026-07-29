import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { RECEIVER, SOME_ADDRESS, XDAIX } from "../../fixtures";

describeHelper("@superfluid:flow", {
  module: "superfluid",
  cases: [
    {
      name: "returns 0 when no stream exists between the accounts",
      input: `@superfluid:flow(${XDAIX} ${SOME_ADDRESS} ${RECEIVER})`,
      validate: (result) => {
        expect(String(result)).to.eq("0");
      },
    },
  ],
  docCases: [
    {
      description: "Print the current flow rate between two accounts",
      code: `print "Flow rate:" @superfluid:flow(xDAIx 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71)`,
    },
  ],
});
