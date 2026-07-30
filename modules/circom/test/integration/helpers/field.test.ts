import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { BN254_PRIME } from "../../../src/utils/field";

describeHelper(
  "@circom:field",
  {
    module: "circom",
    cases: [
      {
        name: "returns small values unchanged",
        input: "@circom:field(42)",
        expected: 42n,
      },
      {
        name: "reduces values above the field prime",
        input: `@circom:field(${BN254_PRIME + 7n})`,
        expected: 7n,
      },
      {
        name: "reduces a 32-byte hash into the field",
        input: `@circom:field(0x${"ff".repeat(32)})`,
        expected: BigInt(`0x${"ff".repeat(32)}`) % BN254_PRIME,
      },
      {
        name: "wraps negative values (circom convention)",
        input: '@circom:field("-1")',
        expected: BN254_PRIME - 1n,
      },
    ],
    errorCases: [
      {
        name: "should fail on a non-numeric value",
        input: '@circom:field("nope")',
        error: "<value> must be a field element",
      },
    ],
    sampleArgs: ["42"],
    docCases: [
      {
        description:
          "Fit a keccak256 hash into the BN254 field before using it as a circuit input",
        code: 'set $leaf @circom:field(@hash("my secret"))\nprint "Leaf:" $leaf',
      },
    ],
  },
  helpers.field.argDefs,
);
