import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@bytes.not",
  {
    module: "lang",
    cases: [
      {
        name: "should return uint256 max for NOT of 0x00",
        input: "@bytes.not(0x00)",
        expected:
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
      {
        name: "should flip bits of 0xff",
        input: "@bytes.not(0xff)",
        expected:
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00",
      },
    ],
    docCases: [
      { description: "Bitwise NOT", code: `set $b @bytes.not(0x00ff)` },
    ],
    sampleArgs: ["0xff"],
  },
  helpers["bytes.not"].argDefs,
);

describeHelper(
  "@bytes.concat",
  {
    module: "lang",
    cases: [
      {
        name: "should concatenate two hex values",
        input: "@bytes.concat(0x01 0x02)",
        expected: "0x0102",
      },
      {
        name: "should concatenate multi-byte values",
        input: "@bytes.concat(0xdead 0xbeef)",
        expected: "0xdeadbeef",
      },
      {
        name: "should compose with @bytes conversion",
        input: "@bytes.concat(@bytes(1) @bytes(2))",
        expected: "0x12",
      },
    ],
    docCases: [
      {
        description: "Concatenate bytes",
        code: `set $c @bytes.concat(0xaa 0xbb)`,
      },
    ],
    sampleArgs: ["0x01"],
  },
  helpers["bytes.concat"].argDefs,
);

describeHelper(
  "@bytes.slice",
  {
    module: "lang",
    cases: [
      {
        name: "should extract a byte range",
        input: "@bytes.slice(0x010203 1 3)",
        expected: "0x0203",
      },
      {
        name: "should extract first N bytes",
        input: "@bytes.slice(0xdeadbeef 0 2)",
        expected: "0xdead",
      },
      {
        name: "should slice from start to end",
        input: "@bytes.slice(0x010203 1)",
        expected: "0x0203",
      },
    ],
    docCases: [
      {
        description: "Slice bytes",
        code: `set $mid @bytes.slice(0xaabbccdd 1 3)`,
      },
    ],
    sampleArgs: ["0x0102", "0", "1"],
  },
  helpers["bytes.slice"].argDefs,
);

describeHelper(
  "@bytes.at",
  {
    module: "lang",
    cases: [
      {
        name: "should access the first byte",
        input: "@bytes.at(0x010203 0)",
        expected: "0x01",
      },
      {
        name: "should access the last byte",
        input: "@bytes.at(0x010203 2)",
        expected: "0x03",
      },
      {
        name: "should support negative index",
        input: "@bytes.at(0x010203 -1)",
        expected: "0x03",
      },
    ],
    docCases: [
      {
        description: "Get byte at index",
        code: `set $first @bytes.at(0xaabbcc 0)`,
      },
    ],
    errorCases: [
      {
        name: "should reject out-of-bounds index",
        input: "@bytes.at(0x0102 5)",
        error: "out of bounds",
      },
    ],
    sampleArgs: ["0x0102", "0"],
  },
  helpers["bytes.at"].argDefs,
);

describeHelper(
  "@bytes.len",
  {
    module: "lang",
    cases: [
      {
        name: "should return byte count for multi-byte value",
        input: "@bytes.len(0x010203)",
        validate(result) {
          expect(result).to.be.instanceOf(Num);
          expect(result.eq(Num(3n))).to.be.true;
        },
      },
      {
        name: "should return 1 for a single byte",
        input: "@bytes.len(0xff)",
        validate(result) {
          expect(result.eq(Num(1n))).to.be.true;
        },
      },
    ],
    docCases: [
      { description: "Get byte length", code: `print @bytes.len(0xaabbccdd)` },
    ],
    sampleArgs: ["0xff"],
  },
  helpers["bytes.len"].argDefs,
);
