import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@abi.encodePacked",
  {
    cases: [
      {
        name: "should pack an address and uint256",
        input: `@abi.encodePacked("address,uint256" 0x44fA8E6f47987339850636F88629646662444217 1e18)`,
        expected:
          "0x44fa8e6f47987339850636f886296466624442170000000000000000000000000000000000000000000000000de0b6b3a7640000",
      },
      {
        name: "should pack a string and uint8",
        input: `@abi.encodePacked("string,uint8" "hello" 1)`,
        expected: "0x68656c6c6f01",
      },
    ],
    docCases: [
      {
        description: "Pack an address and amount",
        code: `set $packed @abi.encodePacked("address,uint256" @me 1e18)\nprint $packed`,
      },
    ],
    errorCases: [
      {
        name: "should fail when value count does not match types",
        input: `@abi.encodePacked("address,uint256" 0x44fA8E6f47987339850636F88629646662444217)`,
        error: "expected 2 value(s)",
      },
    ],
    skipArgLengthCheck: true,
  },
  helpers["abi.encodePacked"].argDefs,
);
