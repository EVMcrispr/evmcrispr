import "../../setup";
import type { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { POSEIDON_1_2, Z1 } from "../../fixtures";

const toBigInts = (values: unknown[]) =>
  values.map((v) => (v as Num).toBigInt());

describeHelper(
  "@circom:tree.proof",
  {
    module: "circom",
    cases: [
      {
        name: "returns [pathIndex siblings] for a lean tree",
        input: "@circom:tree.proof([1 2 3] 1)",
        validate: ([pathIndex, siblings]) => {
          expect(pathIndex.toBigInt()).to.equal(1n);
          expect(toBigInts(siblings)).to.deep.equal([1n, 3n]);
        },
      },
      {
        name: "compresses the path index when a lean level has no sibling",
        input: "@circom:tree.proof([1 2 3] 2)",
        validate: ([pathIndex, siblings]) => {
          // Leaf 3 is alone on level 0, so the proof skips that level.
          expect(pathIndex.toBigInt()).to.equal(1n);
          expect(toBigInts(siblings)).to.deep.equal([POSEIDON_1_2]);
        },
      },
      {
        name: "pads lean siblings and appends the real length with pad:<n>",
        input: "@circom:tree.proof([1 2 3] 1 pad:10)",
        validate: ([pathIndex, siblings, length]) => {
          expect(pathIndex.toBigInt()).to.equal(1n);
          expect(siblings).to.have.length(10);
          expect(toBigInts(siblings).slice(0, 2)).to.deep.equal([1n, 3n]);
          expect(toBigInts(siblings).slice(2)).to.deep.equal(
            Array.from({ length: 8 }, () => 0n),
          );
          expect(length.toBigInt()).to.equal(2n);
        },
      },
      {
        name: "always returns depth siblings for a fixed-depth tree",
        input: "@circom:tree.proof([1 2] 0 depth:4)",
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
        input: "@circom:tree.proof([1 2 3] 3)",
        error: "<index> must be between 0 and 2",
      },
      {
        name: "should reject pad on fixed-depth trees",
        input: "@circom:tree.proof([1 2] 0 depth:4 pad:8)",
        error: "pad: only applies to lean trees",
      },
    ],
    // The options arg is a rest arg (unbounded arity); invalid options are
    // covered by the error cases.
    skipArgLengthCheck: true,
    sampleArgs: ["[1 2 3]", "1"],
    docCases: [
      {
        description:
          "Prove membership: destructure the proof and verify it against the root",
        code: 'set $leaves [1234 5678 9012]\nset $root @circom:tree.root($leaves)\nset [$index $siblings] @circom:tree.proof($leaves 1)\nprint "Valid:" @circom:tree.verify($root 5678 $index $siblings)',
      },
    ],
  },
  helpers["tree.proof"].argDefs,
);
