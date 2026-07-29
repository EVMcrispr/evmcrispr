import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { isAddress } from "viem";
import { helpers } from "../../../src/_generated";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const EOA = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";

describeHelper(
  "@contracts:codeAt",
  {
    module: "contracts",
    cases: [
      {
        name: "should return deployed bytecode for a contract",
        input: `@contracts:codeAt(${WXDAI})`,
        validate: (result) => {
          expect(typeof result).to.equal("string");
          expect(result.startsWith("0x")).to.be.true;
          expect(result.length).to.be.greaterThan(2);
        },
      },
      {
        name: "should return 0x for an EOA",
        input: `@contracts:codeAt(${EOA})`,
        expected: "0x",
      },
    ],
    docCases: [
      {
        description: "Read contract bytecode",
        code: `set $code @contracts:codeAt(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)`,
      },
    ],
    sampleArgs: [WXDAI],
  },
  helpers.codeAt.argDefs,
);

describeHelper(
  "@contracts:storageAt",
  {
    module: "contracts",
    cases: [
      {
        name: "should read a storage slot from a contract",
        input: `@contracts:storageAt(${WXDAI} 0x0000000000000000000000000000000000000000000000000000000000000000)`,
        validate: (result) => {
          expect(typeof result).to.equal("string");
          expect(result.startsWith("0x")).to.be.true;
          expect(result.length).to.equal(66);
        },
      },
      {
        name: "should return zero for an unused slot",
        input: `@contracts:storageAt(${WXDAI} 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff)`,
        expected:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      },
      {
        name: "should left-pad short RPC responses to 32 bytes",
        input: `@contracts:storageAt(${WXDAI} 0x0000000000000000000000000000000000000000000000000000000000000000)`,
        validate: (result) => {
          expect(result.startsWith("0x")).to.be.true;
          expect(result.length).to.equal(66);
        },
      },
    ],
    docCases: [
      {
        description: "Read storage slot 0",
        code: `set $val @contracts:storageAt(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 0x0000000000000000000000000000000000000000000000000000000000000000)`,
      },
    ],
    sampleArgs: [
      WXDAI,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ],
  },
  helpers.storageAt.argDefs,
);

describeHelper(
  "@contracts:next",
  {
    module: "contracts",
    describeName: "Contracts > helpers > @contracts:next(creator, offset?)",
    cases: [
      {
        name: "should return a valid address for the next contract",
        input: `@contracts:next(${TEST_ACCOUNT_ADDRESS})`,
        validate: (result) => {
          expect(isAddress(result)).to.be.true;
        },
      },
      {
        name: "should return a valid address with an offset",
        input: `@contracts:next(${TEST_ACCOUNT_ADDRESS} 1)`,
        validate: (result) => {
          expect(isAddress(result)).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Predict next contract address",
        code: `set $next @contracts:next(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)`,
      },
    ],
    sampleArgs: [TEST_ACCOUNT_ADDRESS],
    skipArgLengthCheck: true,
  },
  helpers.next.argDefs,
);
