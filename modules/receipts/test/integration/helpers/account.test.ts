import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
// The WXDAI deployer — a plain EOA.
const EOA = "0xCED608Aa29bB92185D9b6340Adcbfa263DAe075b";
// USDC on mainnet — a FiatTokenProxy in front of the implementation.
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describeHelper(
  "@receipts:account",
  {
    module: "receipts",
    cases: [
      {
        name: "should classify a contract",
        input: `@receipts:account(${WXDAI})`,
        validate: (result) => {
          expect(typeof result).to.equal("string");
          expect(result).to.include("Contract");
          expect(result).to.include(WXDAI);
          expect(result).to.include("Code size:");
        },
      },
      {
        name: "should classify an EOA",
        input: `@receipts:account(${EOA})`,
        validate: (result) => {
          expect(result.startsWith("EOA")).to.be.true;
          expect(result).to.include(EOA);
        },
      },
      {
        name: "should detect proxies on another chain via the chain arg",
        input: `@receipts:account(${USDC} mainnet)`,
        validate: (result) => {
          expect(result).to.include("Contract");
          // The implementation address changes on upgrades; the proxy
          // marker itself is stable.
          expect(result).to.include("Proxy ->");
        },
      },
    ],
    docCases: [
      {
        description: "Inspect what an address is",
        code: `print @receipts:account(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)`,
      },
    ],
    sampleArgs: [WXDAI, "gnosis"],
  },
  helpers.account.argDefs,
);
