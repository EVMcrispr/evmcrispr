import "../../setup";
import { describeHelper, expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { isAddress } from "viem";
import { helpers } from "../../../src/_generated";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const EOA = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";

describeHelper(
  "@contract.codeAt",
  {
    cases: [
      {
        name: "should return deployed bytecode for a contract",
        input: `@contract.codeAt(${WXDAI})`,
        validate: (result) => {
          expect(typeof result).to.equal("string");
          expect(result.startsWith("0x")).to.be.true;
          expect(result.length).to.be.greaterThan(2);
        },
      },
      {
        name: "should return 0x for an EOA",
        input: `@contract.codeAt(${EOA})`,
        expected: "0x",
      },
    ],
    sampleArgs: [WXDAI],
  },
  helpers["contract.codeAt"].argDefs,
);

describeHelper(
  "@contract.storageAt",
  {
    cases: [
      {
        name: "should read a storage slot from a contract",
        input: `@contract.storageAt(${WXDAI} 0x0000000000000000000000000000000000000000000000000000000000000000)`,
        validate: (result) => {
          expect(typeof result).to.equal("string");
          expect(result.startsWith("0x")).to.be.true;
          expect(result.length).to.equal(66);
        },
      },
      {
        name: "should return zero for an unused slot",
        input: `@contract.storageAt(${WXDAI} 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff)`,
        expected:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      },
    ],
    sampleArgs: [
      WXDAI,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ],
  },
  helpers["contract.storageAt"].argDefs,
);

describeHelper(
  "@contract.next",
  {
    describeName:
      "Std > helpers > @contract.next(creator, offset?)",
    cases: [
      {
        name: "should return a valid address for the next contract",
        input: `@contract.next(${TEST_ACCOUNT_ADDRESS})`,
        validate: (result) => {
          expect(isAddress(result)).to.be.true;
        },
      },
      {
        name: "should return a valid address with an offset",
        input: `@contract.next(${TEST_ACCOUNT_ADDRESS} 1)`,
        validate: (result) => {
          expect(isAddress(result)).to.be.true;
        },
      },
    ],
    sampleArgs: [TEST_ACCOUNT_ADDRESS],
    skipArgLengthCheck: true,
  },
  helpers["contract.next"].argDefs,
);
