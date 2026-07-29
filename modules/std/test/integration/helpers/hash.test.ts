import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { keccak256, sha256, toHex } from "viem";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@hash",
  {
    cases: [
      {
        name: "return the keccak256 hash by default",
        input: "@hash('an example test')",
        expected: keccak256(toHex("an example test")),
      },
      {
        name: "return the keccak256 hash when selected explicitly",
        input: "@hash('an example test' keccak256)",
        expected: keccak256(toHex("an example test")),
      },
      {
        name: "return the sha256 hash when selected",
        input: "@hash('an example test' sha256)",
        expected: sha256(toHex("an example test")),
      },
    ],
    errorCases: [
      {
        input: "@hash('an example test' md5)",
        error: 'unknown hash algorithm "md5"',
      },
    ],
    docCases: [
      {
        description: "Compute a function selector",
        code: `set $sel @hash("transfer(address,uint256)")`,
      },
      {
        description: "Hash with sha256 instead of keccak256",
        code: `set $digest @hash("an example" sha256)`,
      },
    ],
    sampleArgs: ["exampleValue", "keccak256"],
  },
  helpers.hash.argDefs,
);
