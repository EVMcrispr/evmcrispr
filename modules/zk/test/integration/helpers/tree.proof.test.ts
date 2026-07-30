import "../../setup";
import type { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { POSEIDON_1_2, Z1 } from "../../fixtures";

const toBigInts = (values: unknown[]) =>
  values.map((v) => (v as Num).toBigInt());

describeHelper(
  "@zk:tree.proof",
  {
    module: "zk",
    cases: [
      {
        name: "returns [pathIndex siblings] for a lean tree",
        input: "@zk:tree.proof([1 2 3] 1)",
        validate: ([pathIndex, siblings]) => {
          expect(pathIndex.toBigInt()).to.equal(1n);
          expect(toBigInts(siblings)).to.deep.equal([1n, 3n]);
        },
      },
      {
        name: "compresses the path index when a lean level has no sibling",
        input: "@zk:tree.proof([1 2 3] 2)",
        validate: ([pathIndex, siblings]) => {
          // Leaf 3 is alone on level 0, so the proof skips that level.
          expect(pathIndex.toBigInt()).to.equal(1n);
          expect(toBigInts(siblings)).to.deep.equal([POSEIDON_1_2]);
        },
      },
      {
        name: "always returns depth siblings for a fixed-depth tree",
        input: '@zk:tree.proof([1 2] 0 "depth:4")',
        validate: ([pathIndex, siblings]) => {
          expect(pathIndex.toBigInt()).to.equal(0n);
          expect(siblings).to.have.length(4);
          expect(toBigInts(siblings)[0]).to.equal(2n);
          expect(toBigInts(siblings)[1]).to.equal(Z1);
        },
      },
    ],
    errorCases: [
      {
        name: "should fail on an out-of-range index",
        input: "@zk:tree.proof([1 2 3] 3)",
        error: "<index> must be between 0 and 2",
      },
    ],
    sampleArgs: ["[1 2 3]", "1", '"lean"'],
    docCases: [
      {
        description:
          "Prove membership: destructure the proof and verify it against the root",
        code: 'set $leaves [1234 5678 9012]\nset $root @zk:tree.root($leaves)\nset [$index $siblings] @zk:tree.proof($leaves 1)\nprint "Valid:" @zk:tree.verify($root 5678 $index $siblings)',
      },
    ],
  },
  helpers["tree.proof"].argDefs,
);
