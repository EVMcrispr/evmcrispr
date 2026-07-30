import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { BN254_PRIME } from "../../../src/utils/field";

describeHelper(
  "@circom:field.rand",
  {
    module: "circom",
    cases: [
      {
        name: "generates a field element",
        input: "@circom:field.rand()",
        validate: (result) => {
          expect(result.toBigInt() < BN254_PRIME).to.be.true;
          expect(result.toBigInt() >= 0n).to.be.true;
        },
      },
      {
        name: "differs across calls",
        input: "@bool($a != $b)",
        validate: (result) => {
          expect(result).to.equal("true");
        },
      },
    ],
    preamble: "set $a @circom:field.rand()\nset $b @circom:field.rand()",
    docCases: [
      {
        description: "Random secret and its Poseidon commitment",
        code: 'set $secret @circom:field.rand()\nprint "Commitment:" @circom:poseidon($secret)',
      },
    ],
  },
  helpers["field.rand"].argDefs,
);
