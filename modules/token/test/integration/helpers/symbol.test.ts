import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { GNO } from "../../fixtures";

describeHelper(
  "@token:symbol",
  {
    module: "token",
    cases: [
      {
        name: "should return the symbol of a token given by address",
        input: `@token:symbol(${GNO})`,
        expected: "GNO",
      },
      {
        name: "should return the native token symbol",
        input: "@token:symbol(XDAI)",
        expected: "XDAI",
      },
    ],
    docCases: [
      {
        description: "Read the symbol of a token by address",
        code: `set $symbol @token:symbol(0x44fA8E6f47987339850636F88629646662444217)`,
      },
      {
        description: "The native token symbol",
        code: `print @token:symbol(0x0000000000000000000000000000000000000000)`,
      },
    ],
    sampleArgs: [GNO],
  },
  helpers.symbol.argDefs,
);
