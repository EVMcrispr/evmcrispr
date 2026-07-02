import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens.fuses.decode",
  {
    module: "ens",
    cases: [
      {
        name: "decode a fuse bitmap into names",
        input: "@ens.fuses.decode(5)",
        validate: (result) => {
          expect(result).to.deep.equal(["cannot-unwrap", "cannot-transfer"]);
        },
      },
      {
        name: "decode 0 into an empty list",
        input: "@ens.fuses.decode(0)",
        validate: (result) => {
          expect(result).to.deep.equal([]);
        },
      },
    ],
    docCases: [
      {
        description: "Inspect a fuse bitmap",
        code: `set $names @ens.fuses.decode(65537)\nprint $names`,
      },
    ],
    sampleArgs: ["5"],
  },
  helpers["ens.fuses.decode"].argDefs,
);
