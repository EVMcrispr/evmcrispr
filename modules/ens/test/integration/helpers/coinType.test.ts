import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:coinType",
  {
    module: "ens",
    cases: [
      {
        name: "return 60 for mainnet",
        input: "@ens:coinType(mainnet)",
        expected: 60n,
      },
      {
        name: "derive ENSIP-11 coin types for EVM chains",
        input: "@ens:coinType(optimism)",
        expected: 2147483658n,
      },
      {
        name: "accept numeric chain ids",
        input: "@ens:coinType(10)",
        expected: 2147483658n,
      },
      {
        name: "default to the connected chain",
        input: "@ens:coinType()",
        // tests run against a gnosis (100) fork: 0x80000000 | 100
        expected: 2147483748n,
      },
    ],
    docCases: [
      {
        description: "Coin type for an L2 address record",
        code: `set $ct @ens:coinType(optimism)\nprint $ct`,
      },
    ],
    errorCases: [
      {
        name: "fails on unknown chain names",
        input: "@ens:coinType(notachain)",
        error: "must be a chain id or a camelCase viem chain name",
      },
    ],
    sampleArgs: ["mainnet"],
  },
  helpers.coinType.argDefs,
);
