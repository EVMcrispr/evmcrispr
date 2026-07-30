import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite/poseidon2";
import {
  fixedProof,
  fixedRoot,
  fixedVerify,
  leanProof,
  leanRoot,
  leanVerify,
  buildTreeMode,
  zeros,
} from "../../src/utils/tree";
import { FIXED_D4_ROOT_12, LEAN_ROOT_123, Z1, Z2 } from "../fixtures";

const h = (a: bigint, b: bigint) => poseidon2([a, b]);
const range = (n: number) => Array.from({ length: n }, (_, i) => BigInt(i + 1));

describe("circom utils > tree", () => {
  it("builds tree modes", () => {
    expect(buildTreeMode({})).to.deep.equal({ kind: "lean" });
    expect(buildTreeMode({ lean: true })).to.deep.equal({ kind: "lean" });
    expect(buildTreeMode({ depth: 20 })).to.deep.equal({
      kind: "fixed",
      depth: 20,
    });
    expect(() => buildTreeMode({ depth: 0 })).to.throw("depth: must be between");
    expect(() => buildTreeMode({ depth: 33 })).to.throw("depth: must be between");
    expect(() => buildTreeMode({ lean: true, depth: 4 })).to.throw(
      "mutually exclusive",
    );
  });

  describe("lean (LeanIMT)", () => {
    it("pins the root of [1, 2, 3]", () => {
      expect(leanRoot([1n, 2n, 3n], h)).to.equal(LEAN_ROOT_123);
    });

    it("matches @zk-kit/lean-imt roots, proofs and path indices", () => {
      for (const size of [1, 2, 3, 4, 5, 7, 8, 33]) {
        const leaves = range(size);
        const reference = new LeanIMT(h, [...leaves]);
        expect(leanRoot(leaves, h)).to.equal(reference.root);
        for (let index = 0; index < size; index++) {
          const expected = reference.generateProof(index);
          const { siblings, pathIndex } = leanProof(leaves, index, h);
          expect(siblings).to.deep.equal(expected.siblings);
          expect(pathIndex).to.equal(expected.index);
          expect(
            leanVerify(reference.root, leaves[index], pathIndex, siblings, h),
          ).to.be.true;
        }
      }
    });

    it("equates path index and leaf index for complete trees", () => {
      const leaves = range(8);
      for (let index = 0; index < 8; index++) {
        expect(leanProof(leaves, index, h).pathIndex).to.equal(index);
      }
    });

    it("rejects tampered roots, leaves and siblings", () => {
      const leaves = range(5);
      const root = leanRoot(leaves, h);
      const { siblings, pathIndex } = leanProof(leaves, 2, h);
      expect(leanVerify(root, 3n, pathIndex, siblings, h)).to.be.true;
      expect(leanVerify(root + 1n, 3n, pathIndex, siblings, h)).to.be.false;
      expect(leanVerify(root, 4n, pathIndex, siblings, h)).to.be.false;
      const tampered = [...siblings];
      tampered[0] += 1n;
      expect(leanVerify(root, 3n, pathIndex, tampered, h)).to.be.false;
    });

    it("bounds-checks the leaf index", () => {
      expect(() => leanProof([1n, 2n], 2, h)).to.throw(
        "<index> must be between 0 and 1",
      );
      expect(() => leanProof([1n, 2n], -1, h)).to.throw(
        "<index> must be between 0 and 1",
      );
    });
  });

  describe("fixed depth (zero-padded)", () => {
    it("pins the zero chain", () => {
      expect(zeros(2, h)).to.deep.equal([0n, Z1, Z2]);
    });

    it("pins the depth-4 root of [1, 2]", () => {
      expect(fixedRoot([1n, 2n], 4, h)).to.equal(FIXED_D4_ROOT_12);
    });

    it("round-trips proofs at several depths", () => {
      for (const depth of [2, 4, 20]) {
        const leaves = range(Math.min(2 ** depth, 6));
        const root = fixedRoot(leaves, depth, h);
        for (let index = 0; index < leaves.length; index++) {
          const siblings = fixedProof(leaves, index, depth, h);
          expect(siblings).to.have.length(depth);
          expect(fixedVerify(root, leaves[index], index, siblings, h)).to.be
            .true;
          expect(fixedVerify(root, leaves[index] + 1n, index, siblings, h)).to
            .be.false;
        }
      }
    });

    it("enforces tree capacity", () => {
      expect(() => fixedRoot(range(5), 2, h)).to.throw(
        "exceeds the capacity of a depth-2 tree",
      );
    });
  });
});
