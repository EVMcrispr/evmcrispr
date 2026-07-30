import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@circom:tree.verify",
  {
    module: "circom",
    cases: [
      {
        name: "verifies a lean proof produced by @circom:tree.proof",
        input: "@circom:tree.verify($root 5678 $index $siblings)",
        expected: "true",
      },
      {
        name: "rejects a wrong leaf",
        input: "@circom:tree.verify($root 1111 $index $siblings)",
        expected: "false",
      },
      {
        name: "verifies a fixed-depth proof",
        input: '@circom:tree.verify($froot 1234 $findex $fsiblings depth:8)',
        expected: "true",
      },
    ],
    preamble: [
      "set $leaves [1234 5678 9012]",
      "set $root @circom:tree.root($leaves)",
      "set [$index $siblings] @circom:tree.proof($leaves 1)",
      'set $froot @circom:tree.root($leaves depth:8)',
      'set [$findex $fsiblings] @circom:tree.proof($leaves 0 depth:8)',
    ].join("\n"),
    errorCases: [
      {
        name: "should fail when a fixed-depth proof has the wrong length",
        input: '@circom:tree.verify($froot 1234 0 $siblings depth:8)',
        error: "<proof> must have exactly 8 siblings",
      },
    ],
    sampleArgs: ["1", "2", "0", "[3 4]"],
    docCases: [
      {
        description: "Check a member's inclusion proof off-chain",
        code: 'set $leaves [1234 5678 9012]\nset $root @circom:tree.root($leaves)\nset [$index $siblings] @circom:tree.proof($leaves 2)\nprint "Member included:" @circom:tree.verify($root 9012 $index $siblings)',
      },
    ],
  },
  helpers["tree.verify"].argDefs,
);
