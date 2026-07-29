import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { isAddress, zeroAddress } from "viem";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:resolver",
  {
    module: "ens",
    cases: [
      {
        name: "return the resolver of a name",
        input: '@ens:resolver("vitalik.eth")',
        validate: (result) => {
          expect(isAddress(result)).to.be.true;
          expect(result).to.not.equal(zeroAddress);
        },
      },
    ],
    docCases: [
      {
        description: "Get the resolver of a name",
        code: `set $resolver @ens:resolver("vitalik.eth")\nprint $resolver`,
      },
    ],
    sampleArgs: ['"vitalik.eth"'],
  },
  helpers.resolver.argDefs,
);
