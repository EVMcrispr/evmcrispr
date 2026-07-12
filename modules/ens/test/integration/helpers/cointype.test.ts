import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:cointype",
  {
    module: "ens",
    cases: [
      {
        name: "return 60 for mainnet",
        input: "@ens:cointype(mainnet)",
        expected: 60n,
      },
      {
        name: "derive ENSIP-11 coin types for EVM chains",
        input: "@ens:cointype(optimism)",
        expected: 2147483658n,
      },
      {
        name: "accept numeric chain ids",
        input: "@ens:cointype(10)",
        expected: 2147483658n,
      },
      {
        name: "default to the connected chain",
        input: "@ens:cointype()",
        // tests run against a gnosis (100) fork: 0x80000000 | 100
        expected: 2147483748n,
      },
    ],
    docCases: [
      {
        description: "Coin type for an L2 address record",
        code: `set $ct @ens:cointype(optimism)\nprint $ct`,
      },
    ],
    errorCases: [
      {
        name: "fails on unknown chain names",
        input: "@ens:cointype(notachain)",
        error: "must be a chain id or a known chain name",
      },
    ],
    sampleArgs: ["mainnet"],
  },
  helpers.cointype.argDefs,
);
