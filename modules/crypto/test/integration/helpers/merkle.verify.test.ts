import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { LEAF_A, LEAF_B, LEAF_C } from "../../fixtures";

const SORTED_ROOT =
  "0x87fbd8dad686d9536b2ef65757c3415df1b7a4664deb34eda3d91234936eb5fe";
const UNSORTED_ROOT =
  "0x6145e58f72ce6b641069ee7bd2b6af681fcbdd723a4f795f7d2939d00eb2d91d";
// keccak256(LEAF_A ++ LEAF_B) — sibling of LEAF_C in the unsorted tree.
const HASH_AB =
  "0x3e92e0db88d6afea9edc4eedf62fffa4d92bcdfc310dccbe943747fe8302e871";

describeHelper(
  "@crypto:merkle.verify",
  {
    module: "crypto",
    cases: [
      {
        name: "verifies a sorted-pair proof without an index",
        input: `@crypto:merkle.verify(${SORTED_ROOT} ${LEAF_A} [${LEAF_B} ${LEAF_C}])`,
        validate: (result) => {
          expect(String(result)).to.eq("true");
        },
      },
      {
        name: "rejects a sorted-pair proof for the wrong leaf",
        input: `@crypto:merkle.verify(${SORTED_ROOT} ${LEAF_B} [${LEAF_B} ${LEAF_C}])`,
        validate: (result) => {
          expect(String(result)).to.eq("false");
        },
      },
      {
        name: "verifies a positional proof when an index is given",
        input: `@crypto:merkle.verify(${UNSORTED_ROOT} ${LEAF_C} [${LEAF_C} ${HASH_AB}] 2)`,
        validate: (result) => {
          expect(String(result)).to.eq("true");
        },
      },
      {
        name: "rejects a positional proof at the wrong index",
        input: `@crypto:merkle.verify(${UNSORTED_ROOT} ${LEAF_C} [${LEAF_C} ${HASH_AB}] 1)`,
        validate: (result) => {
          expect(String(result)).to.eq("false");
        },
      },
      {
        name: "verifies a single-leaf tree with an empty proof",
        input: `@crypto:merkle.verify(${LEAF_A} ${LEAF_A} [])`,
        validate: (result) => {
          expect(String(result)).to.eq("true");
        },
      },
    ],
    errorCases: [
      {
        name: "should fail on non-bytes32 proof elements",
        input: `@crypto:merkle.verify(${SORTED_ROOT} ${LEAF_A} [0x1234])`,
        error: "<proof> must contain bytes32 values",
      },
    ],
    sampleArgs: [SORTED_ROOT, LEAF_A, `[${LEAF_B} ${LEAF_C}]`, "0"],
    docCases: [
      {
        description:
          "Check a sorted-pair inclusion proof before submitting a claim",
        code: 'set $root 0x87fbd8dad686d9536b2ef65757c3415df1b7a4664deb34eda3d91234936eb5fe\nset $proof [0x2222222222222222222222222222222222222222222222222222222222222222 0x3333333333333333333333333333333333333333333333333333333333333333]\nprint "Included:" @crypto:merkle.verify($root 0x1111111111111111111111111111111111111111111111111111111111111111 $proof)',
      },
      {
        description:
          "Verify a positional (unsorted) proof by passing the leaf index",
        code: 'set $root 0x6145e58f72ce6b641069ee7bd2b6af681fcbdd723a4f795f7d2939d00eb2d91d\nprint "Included:" @crypto:merkle.verify($root 0x3333333333333333333333333333333333333333333333333333333333333333 [0x3333333333333333333333333333333333333333333333333333333333333333 0x3e92e0db88d6afea9edc4eedf62fffa4d92bcdfc310dccbe943747fe8302e871] 2)',
      },
    ],
  },
  helpers["merkle.verify"].argDefs,
);
