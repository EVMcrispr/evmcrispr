import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { privateKeyToAccount } from "viem/accounts";
import { helpers } from "../../../src/_generated";

const PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const SIGNER_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const account = privateKeyToAccount(PRIVATE_KEY);

const MESSAGE = "hello";
const MESSAGE_SIGNATURE = await account.signMessage({ message: MESSAGE });

const TYPED_DATA = {
  domain: { name: "Test", version: "1" },
  types: {
    Mail: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
  },
  primaryType: "Mail" as const,
  message: {
    to: "0x1234567890abcdef1234567890abcdef12345678" as const,
    value: 42,
  },
};

const TYPED_DATA_JSON = JSON.stringify(TYPED_DATA);

const TYPED_SIGNATURE = await account.signTypedData(TYPED_DATA);

describeHelper(
  "@sigValid",
  {
    cases: [
      {
        name: "should return true for a valid personal-message signature",
        input: `@sigValid(${SIGNER_ADDRESS} "${MESSAGE}" ${MESSAGE_SIGNATURE})`,
        validate: (result) => {
          expect(result).to.equal("true");
        },
      },
      {
        name: "should return true for a valid EIP-712 typed-data signature",
        input: `@sigValid(${SIGNER_ADDRESS} '${TYPED_DATA_JSON}' ${TYPED_SIGNATURE})`,
        validate: (result) => {
          expect(result).to.equal("true");
        },
      },
      {
        name: "should return false when the expected signer is wrong",
        input: `@sigValid(${OTHER_ADDRESS} "${MESSAGE}" ${MESSAGE_SIGNATURE})`,
        validate: (result) => {
          expect(result).to.equal("false");
        },
      },
      {
        name: "should return false when the message is tampered",
        input: `@sigValid(${SIGNER_ADDRESS} "tampered" ${MESSAGE_SIGNATURE})`,
        validate: (result) => {
          expect(result).to.equal("false");
        },
      },
      {
        name: "should return false when the typed-data payload is tampered",
        input: `@sigValid(${SIGNER_ADDRESS} '${TYPED_DATA_JSON.replace(
          '"value":42',
          '"value":43',
        )}' ${TYPED_SIGNATURE})`,
        validate: (result) => {
          expect(result).to.equal("false");
        },
      },
      {
        name: "should return false (not throw) on a malformed signature",
        input: `@sigValid(${SIGNER_ADDRESS} "${MESSAGE}" 0xdead)`,
        validate: (result) => {
          expect(result).to.equal("false");
        },
      },
    ],
    docCases: [
      {
        description: "Verify a personal-message signature against the signer",
        code: 'set $ok @sigValid(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 "hello" 0xf16ea9a3478698f695fd1401bfe27e9e4a7e8e3da94aa72b021125e31fa899cc573c48ea3fe1d4ab61a9db10c19032026e3ed2dbccba5a178235ac27f94504311c)\nprint $ok',
      },
    ],
    sampleArgs: [SIGNER_ADDRESS, `"${MESSAGE}"`, MESSAGE_SIGNATURE],
  },
  helpers.sigValid.argDefs,
);
