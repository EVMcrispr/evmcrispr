import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { BN254_PRIME } from "../../../src/utils/field";

describeHelper(
  "@zk:field",
  {
    module: "zk",
    cases: [
      {
        name: "returns small values unchanged",
        input: "@zk:field(42)",
        expected: 42n,
      },
      {
        name: "reduces values above the field prime",
        input: `@zk:field(${BN254_PRIME + 7n})`,
        expected: 7n,
      },
      {
        name: "reduces a 32-byte hash into the field",
        input: `@zk:field(0x${"ff".repeat(32)})`,
        expected: BigInt(`0x${"ff".repeat(32)}`) % BN254_PRIME,
      },
      {
        name: "wraps negative values (circom convention)",
        input: '@zk:field("-1")',
        expected: BN254_PRIME - 1n,
      },
    ],
    errorCases: [
      {
        name: "should fail on a non-numeric value",
        input: '@zk:field("nope")',
        error: "<value> must be a field element",
      },
    ],
    sampleArgs: ["42"],
    docCases: [
      {
        description:
          "Fit a keccak256 hash into the BN254 field before using it as a circuit input",
        code: 'set $leaf @zk:field(@hash("my secret"))\nprint "Leaf:" $leaf',
      },
    ],
  },
  helpers.field.argDefs,
);
