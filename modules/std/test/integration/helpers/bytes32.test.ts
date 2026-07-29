import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";

describeHelper("@bytes32", {
  skipArgLengthCheck: true,
  cases: [
    {
      name: "should left-pad an integer",
      input: "@bytes32(1)",
      expected:
        "0x0000000000000000000000000000000000000000000000000000000000000001",
    },
    {
      name: "should left-pad a hex string by default",
      input: "@bytes32(0xff)",
      expected:
        "0x00000000000000000000000000000000000000000000000000000000000000ff",
    },
    {
      name: "should right-pad a hex string with a trailing right",
      input: "@bytes32(0x01 right)",
      expected:
        "0x0100000000000000000000000000000000000000000000000000000000000000",
    },
    {
      name: "should pass through a full-width hex string",
      input:
        "@bytes32(0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103)",
      expected:
        "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
    },
    {
      name: "should evaluate an arithmetic expression",
      input: '@bytes32(@hash("eip1967.proxy.admin") - 1)',
      expected:
        "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
    },
    {
      name: "should wrap negative integers two's-complement",
      input: "@bytes32(0 - 1)",
      expected:
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
  ],
  docCases: [
    {
      description: "Derive the ERC-1967 admin slot",
      code: `set $slot @bytes32(@hash("eip1967.proxy.admin") - 1)`,
    },
    {
      description: "Right-pad a short hex value",
      code: `set $b @bytes32(0x01 right)`,
    },
  ],
  errorCases: [
    {
      name: "should reject a non-integer number",
      input: "@bytes32(1.5)",
      error: "must be an integer",
    },
    {
      name: "should reject right-padding an integer",
      input: "@bytes32(1 right)",
      error: "right-padding only applies to hex strings",
    },
    {
      name: "should reject a non-hex string",
      input: '@bytes32("hello")',
      error: "must be an integer or a hex string",
    },
    {
      name: "should reject hex longer than 32 bytes",
      input:
        "@bytes32(0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d610300)",
      error: "exceeds 32",
    },
    {
      name: "should reject an empty call",
      input: "@bytes32()",
      error: "requires a value",
    },
  ],
});
