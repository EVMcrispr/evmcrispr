import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:fuses",
  {
    module: "ens",
    cases: [
      {
        name: "encode a single fuse",
        input: '@ens:fuses("cannot-unwrap")',
        expected: 1n,
      },
      {
        name: "OR multiple fuses together",
        input: '@ens:fuses("cannot-unwrap" "cannot-transfer")',
        expected: 5n,
      },
      {
        name: "accept canonical SCREAMING_SNAKE names",
        input: '@ens:fuses("PARENT_CANNOT_CONTROL" "CANNOT_UNWRAP")',
        expected: BigInt(0x10001),
      },
    ],
    docCases: [
      {
        description: "Burn fuses while creating a subname",
        code: `set $fuses @ens:fuses("parent-cannot-control" "cannot-unwrap" "cannot-transfer")\nprint $fuses`,
      },
    ],
    errorCases: [
      {
        name: "fails on unknown fuse names",
        input: '@ens:fuses("cannot-fly")',
        error: "unknown fuse",
      },
      {
        name: "fails on is-dot-eth",
        input: '@ens:fuses("is-dot-eth")',
        error: "cannot be burned",
      },
    ],
    sampleArgs: ['"cannot-unwrap"'],
  },
  helpers.fuses.argDefs,
);
