import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { FIXED_D4_ROOT_12, LEAN_ROOT_123 } from "../../fixtures";

describeHelper(
  "@zk:tree.root",
  {
    module: "zk",
    cases: [
      {
        name: "computes a lean (LeanIMT) root by default",
        input: "@zk:tree.root([1 2 3])",
        expected: LEAN_ROOT_123,
      },
      {
        name: "a single-leaf lean tree has root = leaf",
        input: "@zk:tree.root([7])",
        expected: 7n,
      },
      {
        name: "computes a zero-padded fixed-depth root",
        input: '@zk:tree.root([1 2] depth:4)',
        expected: FIXED_D4_ROOT_12,
      },
    ],
    errorCases: [
      {
        name: "should fail on an empty leaves array",
        input: "@zk:tree.root([])",
        error: "<leaves> must be a non-empty array",
      },
      {
        name: "should fail on an unknown named option",
        input: "@zk:tree.root([1 2] sorted:true)",
        error: 'unknown named argument "sorted:"',
      },
      {
        name: "should fail when the tree overflows its depth",
        input: '@zk:tree.root([1 2 3 4 5] depth:2)',
        error: "exceeds the capacity of a depth-2 tree",
      },
    ],
    sampleArgs: ["[1 2 3]"],
    docCases: [
      {
        description: "Compute the Poseidon Merkle root of a group of members",
        code: 'set $members [1234 5678 9012]\nprint "Root:" @zk:tree.root($members)',
      },
    ],
  },
  helpers["tree.root"].argDefs,
);
