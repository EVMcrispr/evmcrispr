import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

describeHelper(
  "@receipts:txs",
  {
    module: "receipts",
    cases: [
      {
        name: "should list recent transaction hashes",
        input: `@receipts:txs(${WXDAI})`,
        validate: (result) => {
          expect(Array.isArray(result)).to.be.true;
          expect(result.length).to.be.greaterThan(0);
          expect(result.length).to.be.lessThanOrEqual(10);
          for (const hash of result) {
            expect(String(hash)).to.match(TX_HASH_RE);
          }
        },
      },
      {
        name: "should honor the limit argument",
        input: `@receipts:txs(${WXDAI} gnosis 3)`,
        validate: (result) => {
          expect(Array.isArray(result)).to.be.true;
          expect(result.length).to.be.lessThanOrEqual(3);
        },
      },
    ],
    docCases: [
      {
        description: "List the latest transactions of an address",
        code: `set $latest @receipts:txs(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d gnosis 5)`,
      },
    ],
    sampleArgs: [WXDAI, "gnosis", "3"],
  },
  helpers.txs.argDefs,
);
