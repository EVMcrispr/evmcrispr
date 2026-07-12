import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:fuses.of",
  {
    module: "ens",
    errorCases: [
      {
        name: "fails when the name is not wrapped",
        input: '@ens:fuses.of("vitalik.eth")',
        error: "not wrapped",
      },
    ],
    sampleArgs: ['"wrappedname.eth"'],
  },
  helpers["fuses.of"].argDefs,
);
