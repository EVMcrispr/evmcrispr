import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { HOP_TRANSFER_ID, LEAF_A, LEAF_B, LEAF_C } from "../../fixtures";

const SORTED_ROOT =
  "0x87fbd8dad686d9536b2ef65757c3415df1b7a4664deb34eda3d91234936eb5fe";
const UNSORTED_ROOT =
  "0x6145e58f72ce6b641069ee7bd2b6af681fcbdd723a4f795f7d2939d00eb2d91d";

describeHelper(
  "@crypto:merkle.root",
  {
    module: "crypto",
    cases: [
      {
        name: "computes the sorted-pair root by default",
        input: `@crypto:merkle.root([${LEAF_A} ${LEAF_B} ${LEAF_C}])`,
        expected: SORTED_ROOT,
      },
      {
        name: "computes the positional root in unsorted mode",
        input: `@crypto:merkle.root([${LEAF_A} ${LEAF_B} ${LEAF_C}] "unsorted")`,
        expected: UNSORTED_ROOT,
      },
      {
        name: "root of a single-leaf tree is the leaf itself",
        input: `@crypto:merkle.root([${HOP_TRANSFER_ID}] "unsorted")`,
        expected: HOP_TRANSFER_ID,
      },
      {
        name: "accepts leaves through a variable",
        input: "@crypto:merkle.root($leaves)",
        validate: (result) => {
          expect(result).to.eq(SORTED_ROOT);
        },
      },
    ],
    preamble: `set $leaves [${LEAF_A} ${LEAF_B} ${LEAF_C}]`,
    errorCases: [
      {
        name: "should fail on an empty leaves array",
        input: "@crypto:merkle.root([])",
        error: "<leaves> must be a non-empty array",
      },
      {
        name: "should fail on non-bytes32 leaves",
        input: "@crypto:merkle.root([0x1234])",
        error: "<leaves> must contain bytes32 values",
      },
      {
        name: "should fail on an unknown mode",
        input: `@crypto:merkle.root([${LEAF_A}] "bogus")`,
        error: '<mode> must be "sorted" or "unsorted"',
      },
    ],
    sampleArgs: [`[${LEAF_A} ${LEAF_B}]`, '"sorted"'],
    docCases: [
      {
        description:
          "Compute the Merkle root of a set of leaves (sorted pairs, OpenZeppelin convention)",
        code: 'set $leaves [0x1111111111111111111111111111111111111111111111111111111111111111 0x2222222222222222222222222222222222222222222222222222222222222222 0x3333333333333333333333333333333333333333333333333333333333333333]\nprint "Root:" @crypto:merkle.root($leaves)',
      },
      {
        description:
          "Compute a Hop transfer root: positional (unsorted) tree of transferIds — a single-transfer batch has root = transferId",
        code: 'set $transferId 0x234fe879ff0c72a91cb174831cc3eb9477813cea707dc07774ab4272db54d4e3\nprint "Transfer root:" @crypto:merkle.root([$transferId] "unsorted")',
      },
    ],
  },
  helpers["merkle.root"].argDefs,
);
