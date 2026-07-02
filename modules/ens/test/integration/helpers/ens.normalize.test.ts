import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens.normalize",
  {
    module: "ens",
    cases: [
      {
        name: "normalize an ENS name per ENSIP-15",
        input: '@ens.normalize("Vitalik.ETH")',
        expected: "vitalik.eth",
      },
    ],
    docCases: [
      {
        description: "Normalize a mixed-case name",
        code: `set $name @ens.normalize("MyDAO.eth")\nprint $name`,
      },
    ],
    errorCases: [
      {
        name: "fails on invalid names",
        input: '@ens.normalize("not a name")',
        error: "Invalid ENS name",
      },
    ],
    sampleArgs: ['"Vitalik.ETH"'],
  },
  helpers["ens.normalize"].argDefs,
);
