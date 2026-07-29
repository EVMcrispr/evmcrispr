import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { HOP_TRANSFER_ID, LEAF_A, LEAF_B, LEAF_C } from "../../fixtures";

// keccak256(LEAF_A ++ LEAF_B) — the sibling of the promoted odd node.
const HASH_AB =
  "0x3e92e0db88d6afea9edc4eedf62fffa4d92bcdfc310dccbe943747fe8302e871";

describeHelper(
  "@crypto:merkle.proof",
  {
    module: "crypto",
    cases: [
      {
        name: "generates the sorted-pair proof by default",
        input: `@crypto:merkle.proof([${LEAF_A} ${LEAF_B} ${LEAF_C}] 0)`,
        validate: (result) => {
          expect(result).to.deep.eq([LEAF_B, LEAF_C]);
        },
      },
      {
        name: "generates the positional proof in unsorted mode",
        input: `@crypto:merkle.proof([${LEAF_A} ${LEAF_B} ${LEAF_C}] 2 "unsorted")`,
        validate: (result) => {
          expect(result).to.deep.eq([LEAF_C, HASH_AB]);
        },
      },
      {
        name: "proof of a single-leaf tree is empty",
        input: `@crypto:merkle.proof([${HOP_TRANSFER_ID}] 0 "unsorted")`,
        validate: (result) => {
          expect(result).to.deep.eq([]);
        },
      },
    ],
    errorCases: [
      {
        name: "should fail on an out-of-range index",
        input: `@crypto:merkle.proof([${LEAF_A} ${LEAF_B}] 2)`,
        error: "<index> must be between 0 and 1",
      },
      {
        name: "should fail on non-bytes32 leaves",
        input: "@crypto:merkle.proof([0x1234] 0)",
        error: "<leaves> must contain bytes32 values",
      },
    ],
    sampleArgs: [`[${LEAF_A} ${LEAF_B}]`, "0", '"sorted"'],
    docCases: [
      {
        description: "Generate the inclusion proof for the first leaf",
        code: 'set $leaves [0x1111111111111111111111111111111111111111111111111111111111111111 0x2222222222222222222222222222222222222222222222222222222222222222 0x3333333333333333333333333333333333333333333333333333333333333333]\nprint "Proof:" @crypto:merkle.proof($leaves 0)',
      },
      {
        description:
          "Hop-style withdrawal siblings: the only transfer of a batch needs no siblings (empty proof)",
        code: 'set $siblings @crypto:merkle.proof([0x234fe879ff0c72a91cb174831cc3eb9477813cea707dc07774ab4272db54d4e3] 0 "unsorted")\nprint "Siblings:" $siblings',
      },
    ],
  },
  helpers["merkle.proof"].argDefs,
);
