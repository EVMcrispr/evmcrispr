import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:rentPrice",
  {
    describeName: "Ens > helpers > @ens:rentPrice(name, duration)",
    module: "ens",
    cases: [
      {
        name: "return a positive price in wei",
        input: '@ens:rentPrice("vitalik.eth" 31536000)',
        validate: (result) => {
          expect(BigInt(result) > 0n).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Price of one year of registration",
        code: `set $price @ens:rentPrice("mydao.eth" 31536000)\nprint $price`,
      },
    ],
    sampleArgs: ['"vitalik.eth"', "31536000"],
  },
  helpers.rentPrice.argDefs,
);
