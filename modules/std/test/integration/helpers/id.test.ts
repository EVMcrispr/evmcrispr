import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { keccak256, toHex } from "viem";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@id",
  {
    cases: [
      {
        name: "return the hashed value",
        input: "@id('an example test')",
        expected: keccak256(toHex("an example test")),
      },
    ],
    sampleArgs: ["exampleValue"],
  },
  helpers.id.argDefs,
);
