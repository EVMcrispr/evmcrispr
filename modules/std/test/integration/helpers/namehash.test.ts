import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { namehash } from "viem";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@namehash",
  {
    cases: [
      {
        name: "return the ENS node value",
        input: "@namehash(evmcrispr.eth)",
        expected: namehash("evmcrispr.eth"),
      },
    ],
    errorCases: [
      {
        name: "fails if the value is not an ENS domain",
        input: "@namehash('not an ens domain')",
        error: "Invalid ENS name",
      },
    ],
    sampleArgs: ["evmcrispr.eth"],
  },
  helpers.namehash.argDefs,
);
