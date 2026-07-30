import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { BN254_PRIME } from "../../../src/utils/field";

describeHelper(
  "@zk:field.rand",
  {
    module: "zk",
    cases: [
      {
        name: "generates a field element",
        input: "@zk:field.rand()",
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
    preamble: "set $a @zk:field.rand()\nset $b @zk:field.rand()",
    docCases: [
      {
        description: "Random secret and its Poseidon commitment",
        code: 'set $secret @zk:field.rand()\nprint "Commitment:" @zk:poseidon($secret)',
      },
    ],
  },
  helpers["field.rand"].argDefs,
);
