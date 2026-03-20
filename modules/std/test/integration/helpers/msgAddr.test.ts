import "../../setup";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

const message = "hello";
const signature =
  "0xf16ea9a3478698f695fd1401bfe27e9e4a7e8e3da94aa72b021125e31fa899cc573c48ea3fe1d4ab61a9db10c19032026e3ed2dbccba5a178235ac27f94504311c";
const expectedAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describeHelper(
  "@msgAddr",
  {
    cases: [
      {
        name: "should recover the signer address from a signed message",
        input: `@msgAddr("${message}" ${signature})`,
        validate: (result) => {
          expect(result.toLowerCase()).to.equal(expectedAddress.toLowerCase());
        },
      },
    ],
    docCases: [
      {
        description: "Recover signer from a signed message",
        code: `set $signer @msgAddr("${message}" ${signature})\nprint $signer`,
      },
    ],
    errorCases: [
      {
        name: "should fail with an invalid signature",
        input: `@msgAddr("hello" 0xdead)`,
        error: "failed to recover address",
      },
    ],
    sampleArgs: [
      `"${message}"`,
      signature,
    ],
  },
  helpers.msgAddr.argDefs,
);
