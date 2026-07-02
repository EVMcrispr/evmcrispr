import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens.expiry",
  {
    module: "ens",
    cases: [
      {
        name: "return a future expiry for a registered name",
        input: '@ens.expiry("vitalik.eth")',
        validate: (result) => {
          expect(BigInt(result) > BigInt(Math.floor(Date.now() / 1000))).to.be
            .true;
        },
      },
    ],
    docCases: [
      {
        description: "Check when a name expires",
        code: `set $expiry @ens.expiry("vitalik.eth")\nprint $expiry`,
      },
    ],
    errorCases: [
      {
        name: "fails for names that are not .eth second-level names",
        input: '@ens.expiry("sub.vitalik.eth")',
        error: "not a second-level",
      },
      {
        name: "fails for unregistered names",
        input: '@ens.expiry("this-name-definitely-does-not-exist-xyz123.eth")',
        error: "not registered",
      },
    ],
    sampleArgs: ['"vitalik.eth"'],
  },
  helpers["ens.expiry"].argDefs,
);
