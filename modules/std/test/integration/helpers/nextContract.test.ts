import "../../setup";
import { describeHelper, expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { isAddress } from "viem";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@nextContract",
  {
    describeName:
      "Std > helpers > @nextContract(creator, offset?)",
    cases: [
      {
        name: "should return a valid address for the next contract",
        input: `@nextContract(${TEST_ACCOUNT_ADDRESS})`,
        validate: (result) => {
          expect(isAddress(result)).to.be.true;
        },
      },
      {
        name: "should return a valid address with an offset",
        input: `@nextContract(${TEST_ACCOUNT_ADDRESS}, 1)`,
        validate: (result) => {
          expect(isAddress(result)).to.be.true;
        },
      },
    ],
    sampleArgs: [TEST_ACCOUNT_ADDRESS],
    skipArgLengthCheck: true,
  },
  helpers.nextContract.argDefs,
);
