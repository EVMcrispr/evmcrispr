import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { POSEIDON_1, POSEIDON_1_2, POSEIDON_1_2_3 } from "../../fixtures";

describeHelper(
  "@zk:poseidon",
  {
    module: "zk",
    cases: [
      {
        name: "hashes a single field element",
        input: "@zk:poseidon(1)",
        expected: POSEIDON_1,
      },
      {
        name: "hashes two field elements (the circomlib test vector)",
        input: "@zk:poseidon(1 2)",
        expected: POSEIDON_1_2,
      },
      {
        name: "hashes three field elements",
        input: "@zk:poseidon(1 2 3)",
        expected: POSEIDON_1_2_3,
      },
      {
        name: "accepts values through variables",
        input: "@zk:poseidon($a 2)",
        validate: (result) => {
          expect(result.toBigInt()).to.equal(POSEIDON_1_2);
        },
      },
    ],
    preamble: "set $a 1",
    errorCases: [
      {
        name: "should fail beyond 16 inputs",
        input: `@zk:poseidon(${Array(17).fill("1").join(" ")})`,
        error: "@zk:poseidon expects between 1 and 16 inputs, got 17",
      },
      {
        name: "should fail on a non-integer input",
        input: "@zk:poseidon(1.5)",
        error: "<inputs[0]> must be a field element",
      },
    ],
    // Rest-arg helpers have unbounded arity — the 1..16 bound is enforced
    // in run and covered by the explicit error case above.
    skipArgLengthCheck: true,
    sampleArgs: ["1", "2"],
    docCases: [
      {
        description:
          "Hash two values with Poseidon (e.g. a commitment to a secret and a nullifier)",
        code: 'set $commitment @zk:poseidon(1234 5678)\nprint "Commitment:" $commitment',
      },
    ],
  },
  helpers.poseidon.argDefs,
);
