import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:coinType.decode",
  {
    module: "ens",
    cases: [
      {
        name: "decode 60 to mainnet",
        input: "@ens:coinType.decode(60)",
        expected: "mainnet",
      },
      {
        name: "decode ENSIP-11 coin types to chain names",
        input: "@ens:coinType.decode(2147483658)",
        expected: "optimism",
      },
      {
        name: "fall back to the chain id for unknown chains",
        input: `@ens:coinType.decode(${(0x80000000 | 99999999) >>> 0})`,
        expected: "99999999",
      },
    ],
    docCases: [
      {
        description: "Find out which chain a coin type belongs to",
        code: `set $chain @ens:coinType.decode(2147483658)\nprint $chain`,
      },
    ],
    errorCases: [
      {
        name: "fails on non-ENSIP-11 coin types",
        input: "@ens:coinType.decode(0)",
        error: "not an ENSIP-11 EVM coin type",
      },
    ],
    sampleArgs: ["60"],
  },
  helpers["coinType.decode"].argDefs,
);
