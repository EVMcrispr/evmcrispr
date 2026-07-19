import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";
import { concat, type Hex, keccak256, toHex } from "viem";
import {
  merkleProof,
  merkleRoot,
  parseLeaves,
  parseMode,
  verifySorted,
  verifyUnsorted,
} from "../../src/utils/merkle";
import { LEAF_A, LEAF_B, LEAF_C } from "../fixtures";

const leavesOf = (n: number): Hex[] =>
  Array.from({ length: n }, (_, i) => keccak256(toHex(i, { size: 32 })));

const SIZES = [1, 2, 3, 4, 5, 7, 8, 33];

function expectThrow(fn: () => any, messagePart: string): void {
  let error: Error | null = null;
  try {
    fn();
  } catch (err: any) {
    error = err;
  }
  expect(error, "Exception not thrown").not.to.be.null;
  expect(error!.message).to.include(messagePart);
}

describe("Crypto > utils > merkle (sorted mode)", () => {
  it("matches @openzeppelin/merkle-tree roots for every size", () => {
    for (const n of SIZES) {
      const leaves = leavesOf(n);
      const ozTree = SimpleMerkleTree.of(leaves, { sortLeaves: false });
      expect(merkleRoot(leaves, "sorted")).to.eq(ozTree.root);
    }
  });

  it("matches @openzeppelin/merkle-tree proofs for every leaf", () => {
    for (const n of SIZES) {
      const leaves = leavesOf(n);
      const ozTree = SimpleMerkleTree.of(leaves, { sortLeaves: false });
      for (let i = 0; i < n; i++) {
        expect(merkleProof(leaves, i, "sorted")).to.deep.eq(ozTree.getProof(i));
      }
    }
  });

  it("produces proofs that OpenZeppelin and verifySorted accept", () => {
    for (const n of SIZES) {
      const leaves = leavesOf(n);
      const root = merkleRoot(leaves, "sorted");
      for (let i = 0; i < n; i++) {
        const proof = merkleProof(leaves, i, "sorted");
        expect(SimpleMerkleTree.verify(root, leaves[i], proof)).to.be.true;
        expect(verifySorted(root, leaves[i], proof)).to.be.true;
      }
    }
  });

  it("rejects proofs for the wrong leaf or tampered siblings", () => {
    const leaves = leavesOf(8);
    const root = merkleRoot(leaves, "sorted");
    const proof = merkleProof(leaves, 3, "sorted");
    expect(verifySorted(root, leaves[4], proof)).to.be.false;
    const tampered = [...proof];
    tampered[0] = keccak256(tampered[0]);
    expect(verifySorted(root, leaves[3], tampered)).to.be.false;
  });
});

describe("Crypto > utils > merkle (unsorted mode)", () => {
  it("root of a single leaf is the leaf itself, with an empty proof", () => {
    for (const mode of ["sorted", "unsorted"] as const) {
      expect(merkleRoot([LEAF_A], mode)).to.eq(LEAF_A);
      expect(merkleProof([LEAF_A], 0, mode)).to.deep.eq([]);
    }
  });

  it("hashes pairs positionally", () => {
    expect(merkleRoot([LEAF_A, LEAF_B], "unsorted")).to.eq(
      keccak256(concat([LEAF_A, LEAF_B])),
    );
    // Positional trees are order-sensitive, sorted trees are not.
    expect(merkleRoot([LEAF_B, LEAF_A], "unsorted")).to.not.eq(
      merkleRoot([LEAF_A, LEAF_B], "unsorted"),
    );
    expect(merkleRoot([LEAF_B, LEAF_A], "sorted")).to.eq(
      merkleRoot([LEAF_A, LEAF_B], "sorted"),
    );
  });

  it("pairs a trailing odd node with itself", () => {
    const root = merkleRoot([LEAF_A, LEAF_B, LEAF_C], "unsorted");
    expect(root).to.eq(
      keccak256(
        concat([
          keccak256(concat([LEAF_A, LEAF_B])),
          keccak256(concat([LEAF_C, LEAF_C])),
        ]),
      ),
    );
    expect(merkleProof([LEAF_A, LEAF_B, LEAF_C], 2, "unsorted")).to.deep.eq([
      LEAF_C,
      keccak256(concat([LEAF_A, LEAF_B])),
    ]);
  });

  it("round-trips proof generation and index-folding verification", () => {
    for (const n of SIZES) {
      const leaves = leavesOf(n);
      const root = merkleRoot(leaves, "unsorted");
      for (let i = 0; i < n; i++) {
        const proof = merkleProof(leaves, i, "unsorted");
        expect(verifyUnsorted(root, leaves[i], proof, i)).to.be.true;
      }
    }
  });

  it("rejects proofs at the wrong index or for the wrong leaf", () => {
    const leaves = leavesOf(8);
    const root = merkleRoot(leaves, "unsorted");
    const proof = merkleProof(leaves, 3, "unsorted");
    expect(verifyUnsorted(root, leaves[3], proof, 2)).to.be.false;
    expect(verifyUnsorted(root, leaves[4], proof, 3)).to.be.false;
  });
});

describe("Crypto > utils > merkle (validation)", () => {
  it("parses and defaults the mode", () => {
    expect(parseMode(undefined)).to.eq("sorted");
    expect(parseMode("sorted")).to.eq("sorted");
    expect(parseMode("unsorted")).to.eq("unsorted");
    expectThrow(
      () => parseMode("bogus"),
      '<mode> must be "sorted" or "unsorted"',
    );
  });

  it("rejects empty and malformed leaf arrays", () => {
    expectThrow(() => parseLeaves([]), "must be a non-empty array");
    expectThrow(() => parseLeaves("0x01"), "must be a non-empty array");
    expectThrow(() => parseLeaves(["0x1234"]), "must contain bytes32 values");
  });

  it("rejects out-of-range proof indices", () => {
    const leaves = leavesOf(4);
    expectThrow(() => merkleProof(leaves, 4, "sorted"), "between 0 and 3");
    expectThrow(() => merkleProof(leaves, -1, "unsorted"), "between 0 and 3");
  });
});
