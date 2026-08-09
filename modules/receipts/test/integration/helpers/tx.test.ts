import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

/* Historical transactions are immutable — every asserted field below is
 * frozen on-chain forever, so exact assertions are safe. */

// The first WXDAI deposit() on gnosis (2020-07-27): 0.1 xDAI from the
// deployer, gasPrice 1 gwei.
const DEPOSIT_TX =
  "0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13";
const DEPOSIT_FROM = "0xCED608Aa29bB92185D9b6340Adcbfa263DAe075b";
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

// The WXDAI contract-creation transaction, nine blocks earlier.
const CREATION_TX =
  "0x0c2632fc6588506d3a6a1cdb10140bb9281f898f6c1b532728409c623ca8432b";

// Mainnet's very first transaction (block 46147, 31337 wei).
const FIRST_MAINNET_TX =
  "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";

const UNKNOWN_TX =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

describeHelper(
  "@receipts:tx",
  {
    module: "receipts",
    cases: [
      {
        name: "should summarize a mined transaction",
        input: `@receipts:tx(${DEPOSIT_TX})`,
        validate: (result) => {
          expect(typeof result).to.equal("string");
          expect(result).to.include("Success");
          expect(result).to.include("block 11173946");
          expect(result).to.include("Gas: 43,741");
        },
      },
    ],
    errorCases: [
      {
        name: "should hint at the chain argument for unknown hashes",
        input: `@receipts:tx(${UNKNOWN_TX})`,
        error: "pass the chain as a second argument",
      },
    ],
    docCases: [
      {
        description: "Print a human-readable transaction summary",
        code: `print @receipts:tx(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)`,
      },
    ],
    sampleArgs: [DEPOSIT_TX, "gnosis"],
  },
  helpers.tx.argDefs,
);

describeHelper(
  "@receipts:tx.from",
  {
    module: "receipts",
    cases: [
      {
        input: `@receipts:tx.from(${DEPOSIT_TX})`,
        expected: DEPOSIT_FROM,
      },
    ],
    docCases: [
      {
        description: "Read the sender of a transaction",
        code: `set $sender @receipts:tx.from(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)`,
      },
    ],
    sampleArgs: [DEPOSIT_TX, "gnosis"],
  },
  helpers["tx.from"].argDefs,
);

describeHelper(
  "@receipts:tx.to",
  {
    module: "receipts",
    cases: [
      {
        input: `@receipts:tx.to(${DEPOSIT_TX})`,
        expected: WXDAI,
      },
    ],
    errorCases: [
      {
        name: "should error for contract-creation transactions",
        input: `@receipts:tx.to(${CREATION_TX})`,
        error: "contract creation",
      },
    ],
    docCases: [
      {
        description: "Read the target of a transaction",
        code: `set $target @receipts:tx.to(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)`,
      },
    ],
    sampleArgs: [DEPOSIT_TX, "gnosis"],
  },
  helpers["tx.to"].argDefs,
);

describeHelper(
  "@receipts:tx.value",
  {
    module: "receipts",
    cases: [
      {
        input: `@receipts:tx.value(${DEPOSIT_TX})`,
        validate: (result) => {
          expect(String(result)).to.equal("100000000000000000");
        },
      },
      {
        name: "should read a transaction on another chain via the chain arg",
        input: `@receipts:tx.value(${FIRST_MAINNET_TX} mainnet)`,
        validate: (result) => {
          expect(String(result)).to.equal("31337");
        },
      },
    ],
    docCases: [
      {
        description: "Read the native value of a transaction on another chain",
        code: `set $wei @receipts:tx.value(0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060 mainnet)`,
      },
    ],
    sampleArgs: [DEPOSIT_TX, "gnosis"],
  },
  helpers["tx.value"].argDefs,
);

describeHelper(
  "@receipts:tx.calldata",
  {
    module: "receipts",
    cases: [
      {
        input: `@receipts:tx.calldata(${DEPOSIT_TX})`,
        expected: "0xd0e30db0",
      },
    ],
    docCases: [
      {
        description: "Read the calldata of a transaction",
        code: `set $data @receipts:tx.calldata(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)`,
      },
    ],
    sampleArgs: [DEPOSIT_TX, "gnosis"],
  },
  helpers["tx.calldata"].argDefs,
);

describeHelper(
  "@receipts:tx.status",
  {
    module: "receipts",
    cases: [
      {
        input: `@receipts:tx.status(${DEPOSIT_TX})`,
        validate: (result) => {
          expect(result).to.equal(true);
        },
      },
    ],
    docCases: [
      {
        description: "Check that a transaction succeeded",
        code: `set $ok @receipts:tx.status(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)`,
      },
    ],
    sampleArgs: [DEPOSIT_TX, "gnosis"],
  },
  helpers["tx.status"].argDefs,
);

describeHelper(
  "@receipts:tx.gasUsed",
  {
    module: "receipts",
    cases: [
      {
        input: `@receipts:tx.gasUsed(${DEPOSIT_TX})`,
        validate: (result) => {
          expect(String(result)).to.equal("43741");
        },
      },
    ],
    docCases: [
      {
        description: "Read the gas used by a transaction",
        code: `set $gas @receipts:tx.gasUsed(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)`,
      },
    ],
    sampleArgs: [DEPOSIT_TX, "gnosis"],
  },
  helpers["tx.gasUsed"].argDefs,
);

describeHelper(
  "@receipts:tx.fee",
  {
    module: "receipts",
    cases: [
      {
        // 43741 gas at 1 gwei.
        input: `@receipts:tx.fee(${DEPOSIT_TX})`,
        validate: (result) => {
          expect(String(result)).to.equal("43741000000000");
        },
      },
    ],
    docCases: [
      {
        description: "Read the total fee paid for a transaction",
        code: `set $fee @receipts:tx.fee(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)`,
      },
    ],
    sampleArgs: [DEPOSIT_TX, "gnosis"],
  },
  helpers["tx.fee"].argDefs,
);

describeHelper(
  "@receipts:tx.block",
  {
    module: "receipts",
    cases: [
      {
        input: `@receipts:tx.block(${DEPOSIT_TX})`,
        validate: (result) => {
          expect(String(result)).to.equal("11173946");
        },
      },
    ],
    docCases: [
      {
        description: "Read the block a transaction was mined in",
        code: `set $block @receipts:tx.block(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)`,
      },
    ],
    sampleArgs: [DEPOSIT_TX, "gnosis"],
  },
  helpers["tx.block"].argDefs,
);

describeHelper(
  "@receipts:tx.timestamp",
  {
    module: "receipts",
    cases: [
      {
        input: `@receipts:tx.timestamp(${DEPOSIT_TX})`,
        validate: (result) => {
          expect(String(result)).to.equal("1595862470");
        },
      },
    ],
    docCases: [
      {
        description: "Read the timestamp a transaction was mined at",
        code: `set $when @receipts:tx.timestamp(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)`,
      },
    ],
    sampleArgs: [DEPOSIT_TX, "gnosis"],
  },
  helpers["tx.timestamp"].argDefs,
);
