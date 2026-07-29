import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:available",
  {
    module: "ens",
    cases: [
      {
        name: "return false for registered names",
        input: '@ens:available("vitalik.eth")',
        validate: (result) => {
          expect(result).to.be.false;
        },
      },
      {
        name: "return true for unregistered names",
        input: '@ens:available("this-name-definitely-does-not-exist-xyz123")',
        validate: (result) => {
          expect(result).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Check availability before registering",
        code: `set $free @ens:available("mydao.eth")\nprint $free`,
      },
    ],
    sampleArgs: ['"vitalik.eth"'],
  },
  helpers.available.argDefs,
);
