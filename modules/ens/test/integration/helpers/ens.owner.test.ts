import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { isAddress, zeroAddress } from "viem";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens.owner",
  {
    module: "ens",
    cases: [
      {
        name: "return the owner of a name",
        input: '@ens.owner("vitalik.eth")',
        validate: (result) => {
          expect(isAddress(result)).to.be.true;
          expect(result).to.not.equal(zeroAddress);
        },
      },
    ],
    docCases: [
      {
        description: "Get the owner of a name",
        code: `set $owner @ens.owner("vitalik.eth")\nprint $owner`,
      },
    ],
    errorCases: [
      {
        name: "fails for unregistered names",
        input: '@ens.owner("this-name-definitely-does-not-exist-xyz123.eth")',
        error: "no owner found",
      },
    ],
    sampleArgs: ['"vitalik.eth"'],
  },
  helpers["ens.owner"].argDefs,
);
