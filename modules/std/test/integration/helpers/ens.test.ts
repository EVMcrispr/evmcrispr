import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens",
  {
    cases: [
      {
        name: "return the resolved address",
        input: "@ens('vitalik.eth')",
        expected: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      },
    ],
    errorCases: [
      {
        name: "should fail when ENS name not found",
        input: "@ens('_notfound.eth')",
        error: "ENS name _notfound.eth not found",
      },
    ],
    sampleArgs: ["exampleValue"],
  },
  helpers.ens.argDefs,
);
