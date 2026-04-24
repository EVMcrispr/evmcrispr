import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

const vitalikAddr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describeHelper(
  "@ens.name",
  {
    describeName: "Ens > helpers > @ens.name(address)",
    module: "ens",
    cases: [
      {
        name: "should reverse-resolve vitalik's address",
        input: `@ens.name(${vitalikAddr})`,
        expected: "vitalik.eth",
      },
    ],
    docCases: [
      {
        description: "Reverse-resolve an address to an ENS name",
        code: `set $name @ens.name(0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)\nprint $name`,
      },
    ],
    errorCases: [
      {
        name: "should fail when no primary name is set",
        input: "@ens.name(0x0000000000000000000000000000000000000001)",
        error: "no primary ENS name found",
      },
    ],
  },
  helpers["ens.name"].argDefs,
);
