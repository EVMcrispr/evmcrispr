import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:contenthash.of",
  {
    module: "ens",
    cases: [
      {
        name: "read and decode a content hash",
        input: '@ens:contenthash.of("vitalik.eth")',
        validate: (result) => {
          expect(result).to.be.a("string");
          expect(result).to.match(/^[a-z0-9-]+:\/\/.+/);
        },
      },
    ],
    docCases: [
      {
        description: "Read the content hash behind a name",
        code: `set $hash @ens:contenthash.of("vitalik.eth")\nprint $hash`,
      },
    ],
    sampleArgs: ['"vitalik.eth"'],
  },
  helpers["contenthash.of"].argDefs,
);
