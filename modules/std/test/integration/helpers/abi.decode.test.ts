import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@abi.decode",
  {
    cases: [
      {
        name: "should decode a single uint256",
        input:
          "@abi.decode(uint256 0x0000000000000000000000000000000000000000000000000000000000000064)",
        validate: (result) => {
          expect(result).to.be.an("array");
          expect(result).to.have.lengthOf(1);
          expect(result[0]).to.equal(100n);
        },
      },
      {
        name: "should decode uint256 and address",
        input:
          '@abi.decode("uint256,address" 0x000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000044fa8e6f47987339850636f88629646662444217)',
        validate: (result) => {
          expect(result).to.be.an("array");
          expect(result).to.have.lengthOf(2);
          expect(result[0]).to.equal(42n);
          expect(result[1].toLowerCase()).to.equal(
            "0x44fa8e6f47987339850636f88629646662444217",
          );
        },
      },
    ],
    docCases: [
      {
        description: "Decode a single uint256",
        code: `set $values @abi.decode("uint256" 0x0000000000000000000000000000000000000000000000000000000000000064)\nprint $values`,
      },
      {
        description: "Decode multiple types",
        code: `set $values @abi.decode("uint256,address" 0x000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000044fa8e6f47987339850636f88629646662444217)\nprint $values`,
      },
    ],
    errorCases: [
      {
        name: "should fail with an invalid type list",
        input: "@abi.decode(notAType 0x00)",
        error: "invalid type list",
      },
    ],
    sampleArgs: [
      '"uint256"',
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      "[$]",
    ],
  },
  helpers["abi.decode"].argDefs,
);
