import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { namehash } from "viem";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@namehash",
  {
    module: "ens",
    cases: [
      {
        name: "return the ENS node value",
        input: "@namehash(evmcrispr.eth)",
        expected: namehash("evmcrispr.eth"),
      },
    ],
    docCases: [
      {
        description: "Hash an ENS domain",
        code: `set $node @namehash("vitalik.eth")`,
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
