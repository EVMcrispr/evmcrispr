import "../../setup";
import type { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@circom:field.bits",
  {
    module: "circom",
    cases: [
      {
        name: "decomposes LSB-first",
        input: "@circom:field.bits(5 4)",
        validate: (result) => {
          expect((result as Num[]).map((b) => b.toBigInt())).to.deep.equal([
            1n,
            0n,
            1n,
            0n,
          ]);
        },
      },
    ],
    errorCases: [
      {
        name: "should fail when the value does not fit",
        input: "@circom:field.bits(8 3)",
        error: "does not fit in 3 bits",
      },
    ],
    sampleArgs: ["5", "4"],
    docCases: [
      {
        description:
          "Turn a Merkle path index into the per-level indices a circuit expects",
        code: "set $leaves [1234 5678 9012]\nset [$index $siblings $len] @circom:tree.proof($leaves 1 pad:10)\nprint \"Indices:\" @circom:field.bits($index 10)",
      },
    ],
  },
  helpers["field.bits"].argDefs,
);
