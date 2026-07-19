import "../../setup";
import { HelperFunctionError } from "@evmcrispr/sdk";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

const PINATA_JWT = process.env.VITE_PINATA_JWT;

describeHelper(
  "@ipfs",
  {
    skip: !PINATA_JWT,
    describeName: "Std > helpers > @ipfs(text)",
    preamble: PINATA_JWT ? `set $std:ipfsJwt ${PINATA_JWT}` : undefined,
    cases: [
      {
        name: "should upload text to IPFS and return hash",
        input: "@ipfs('This should be pinned in IPFS')",
        expected: "QmeA34sMpR2EZfVdPsxYk7TMLxmQxhcgNer67UyTkiwKns",
      },
    ],
    docCases: [
      {
        description: "Upload text to IPFS",
        code: `set $cid @ipfs("hello world")`,
        preamble: PINATA_JWT ? `set $std:ipfsJwt ${PINATA_JWT}` : undefined,
      },
    ],
    sampleArgs: ["'This should be pinned in IPFS'"],
  },
  helpers.ipfs.argDefs,
);

describeHelper("@ipfs", {
  skip: !PINATA_JWT,
  describeName: "Std > helpers > @ipfs(text) > error: missing JWT",
  skipArgLengthCheck: true,
  errorCases: [
    {
      name: "should fail when not setting pinata JWT variable",
      input: "@ipfs('some text')",
      error: (helperNode) =>
        new HelperFunctionError(
          helperNode,
          "$std:ipfsJwt is not defined. Go to pinata.cloud and obtain your API key, please",
        ),
    },
  ],
});

describeHelper("@ipfs", {
  skip: !PINATA_JWT,
  describeName: "Std > helpers > @ipfs(text) > error: invalid JWT",
  preamble: 'set $std:ipfsJwt "an invalid JWT"',
  skipArgLengthCheck: true,
  errorCases: [
    {
      name: "should fail when setting an invalid pinata JWT",
      input: '@ipfs("someText")',
      error: "an error occurred while uploading data to IPFS",
    },
  ],
});
