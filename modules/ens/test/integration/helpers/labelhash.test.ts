import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { labelhash } from "viem";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@labelhash",
  {
    module: "ens",
    cases: [
      {
        name: "return the labelhash of a label",
        input: '@labelhash("vitalik")',
        expected: labelhash("vitalik"),
      },
    ],
    docCases: [
      {
        description: "Hash a single ENS label",
        code: `set $label @labelhash("vitalik")`,
      },
    ],
    errorCases: [
      {
        name: "fails when the label contains dots",
        input: '@labelhash("vitalik.eth")',
        error: "labels cannot contain dots",
      },
    ],
    sampleArgs: ['"vitalik"'],
  },
  helpers.labelhash.argDefs,
);
