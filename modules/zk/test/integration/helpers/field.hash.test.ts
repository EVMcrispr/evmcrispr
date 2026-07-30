import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { BN254_PRIME } from "../../../src/utils/field";
import { FIELD_HASH_0X01 } from "../../fixtures";

describeHelper(
  "@zk:field.hash",
  {
    module: "zk",
    cases: [
      {
        name: "hashes bytes into the field",
        input: "@zk:field.hash(0x01)",
        expected: FIELD_HASH_0X01,
      },
      {
        name: "always lands inside the field",
        input: "@zk:field.hash(0xdeadbeef)",
        validate: (result) => {
          if (result.toBigInt() >= BN254_PRIME) {
            throw new Error("result outside the field");
          }
        },
      },
    ],
    errorCases: [
      {
        name: "should fail on non-hex data",
        input: '@zk:field.hash("hello")',
        error: "<data>",
      },
    ],
    sampleArgs: ["0x01"],
    docCases: [
      {
        description:
          "Map an address into a field element (e.g. as a tree leaf)",
        code: 'print "Leaf:" @zk:field.hash(@me)',
      },
    ],
  },
  helpers["field.hash"].argDefs,
);
