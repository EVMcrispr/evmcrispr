import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
// The WXDAI deployer — an EOA that has sent transactions.
const EOA = "0xCED608Aa29bB92185D9b6340Adcbfa263DAe075b";

describeHelper(
  "@receipts:tx.count",
  {
    module: "receipts",
    cases: [
      {
        // A contract that never CREATEs keeps the EIP-161 initial nonce
        // of 1 forever — safe to assert exactly.
        name: "should read a contract nonce (counts CREATEs)",
        input: `@receipts:tx.count(${WXDAI})`,
        validate: (result) => {
          expect(String(result)).to.equal("1");
        },
      },
      {
        name: "should count transactions sent from an EOA",
        input: `@receipts:tx.count(${EOA} gnosis)`,
        validate: (result) => {
          expect(Number(result)).to.be.greaterThan(0);
        },
      },
    ],
    docCases: [
      {
        description: "Read the nonce of an account",
        code: `set $nonce @receipts:tx.count(0xCED608Aa29bB92185D9b6340Adcbfa263DAe075b)`,
      },
    ],
    sampleArgs: [EOA, "gnosis"],
  },
  helpers["tx.count"].argDefs,
);
