import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { encodeAbiParameters, parseAbiParameters, toHex } from "viem";
import { helpers } from "../../../src/_generated";

const addr = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";

describeHelper(
  "@abi.encode",
  {
    describeName: "Std > helpers > @abi.encode(types, ...values)",
    cases: [
      {
        name: "should encode a uint256 and an address",
        input: `@abi.encode("uint256,address" 100 ${addr})`,
        validate: (result) => {
          const expected = encodeAbiParameters(
            parseAbiParameters("uint256,address"),
            [100n, addr],
          );
          expect(result).to.equal(expected);
        },
      },
      {
        name: "should encode exponent number literals",
        input: `@abi.encode("uint256" 1e18)`,
        validate: (result) => {
          const expected = encodeAbiParameters(parseAbiParameters("uint256"), [
            10n ** 18n,
          ]);
          expect(result).to.equal(expected);
        },
      },
      {
        name: "should coerce non-hex strings to bytes",
        input: `@abi.encode("bool,bytes" true hello)`,
        validate: (result) => {
          const expected = encodeAbiParameters(
            parseAbiParameters("bool,bytes"),
            [true, toHex("hello")],
          );
          expect(result).to.equal(expected);
        },
      },
      {
        name: "should round-trip through @abi.decode",
        input: `@abi.decode("uint256" @abi.encode("uint256" 42))`,
        validate: (result) => {
          expect(result).to.deep.equal([42n]);
        },
      },
    ],
    docCases: [
      {
        description: "Encode values without a selector",
        code: `set $data @abi.encode("uint256,address" 100e18 0x44fA8E6f47987339850636F88629646662444217)\nprint $data`,
      },
    ],
    errorCases: [
      {
        name: "should fail with an invalid type list",
        input: "@abi.encode(notAType 0x00)",
        error: "invalid type list",
      },
      {
        name: "should fail when values do not match the type count",
        input: `@abi.encode("uint256,address" 1)`,
        error: "expected 2 value(s), got 1",
      },
    ],
    sampleArgs: ['"uint256"', "1"],
    skipArgLengthCheck: true,
  },
  helpers["abi.encode"].argDefs,
);
