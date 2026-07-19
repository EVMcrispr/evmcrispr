/**
 * Merkle tree primitives over raw bytes32 leaves.
 *
 * Two pair-hashing conventions are supported:
 *
 * - `sorted` — pairs are sorted before hashing, so proofs are verifiable
 *   with OpenZeppelin's `MerkleProof.verify` without positional data. The
 *   tree layout is a port of @openzeppelin/merkle-tree's core algorithm
 *   (https://github.com/OpenZeppelin/merkle-tree, MIT) onto viem
 *   primitives, so roots and proofs match `SimpleMerkleTree` for the same
 *   leaf order (note: the OZ library sorts leaves by default; pre-sort the
 *   leaves to reproduce those roots).
 *
 * - `unsorted` — pairs are hashed in positional order and odd nodes are
 *   paired with themselves, so proofs verify by folding the leaf index one
 *   bit per sibling (the semantic of Optimism/Hop `Lib_MerkleTree.verify`).
 *
 * A single-leaf tree has root = leaf and an empty proof in both modes.
 */
import { ErrorException } from "@evmcrispr/sdk";
import { concat, type Hex, keccak256 } from "viem";

export type MerkleMode = "sorted" | "unsorted";

export function parseMode(value: unknown): MerkleMode {
  if (value === undefined || value === "sorted") return "sorted";
  if (value === "unsorted") return "unsorted";
  throw new ErrorException(
    `<mode> must be "sorted" or "unsorted", got ${value}`,
  );
}

export function parseLeaves(value: unknown, argName = "leaves"): Hex[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ErrorException(`<${argName}> must be a non-empty array`);
  }
  return value.map((leaf) => parseBytes32(leaf, argName));
}

/** Like {@link parseLeaves} but an empty array is valid (single-leaf proofs). */
export function parseProof(value: unknown, argName = "proof"): Hex[] {
  if (!Array.isArray(value)) {
    throw new ErrorException(`<${argName}> must be an array`);
  }
  return value.map((node) => parseBytes32(node, argName));
}

export function parseBytes32(value: unknown, argName: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new ErrorException(
      `<${argName}> must contain bytes32 values, got ${value}`,
    );
  }
  return value as Hex;
}

function hashSortedPair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b)
    ? keccak256(concat([a, b]))
    : keccak256(concat([b, a]));
}

function hashOrderedPair(left: Hex, right: Hex): Hex {
  return keccak256(concat([left, right]));
}

// ─── sorted mode — OZ complete-tree layout ──────────────────────────────
// The tree is a flat array of 2n-1 nodes: the root at 0, children of node
// i at 2i+1 / 2i+2, and the leaves (in reverse order) filling the tail.

function makeSortedTree(leaves: Hex[]): Hex[] {
  const tree = new Array<Hex>(2 * leaves.length - 1);
  for (const [i, leaf] of leaves.entries()) {
    tree[tree.length - 1 - i] = leaf;
  }
  for (let i = tree.length - 1 - leaves.length; i >= 0; i--) {
    tree[i] = hashSortedPair(tree[2 * i + 1], tree[2 * i + 2]);
  }
  return tree;
}

function sortedProof(leaves: Hex[], index: number): Hex[] {
  const tree = makeSortedTree(leaves);
  const proof: Hex[] = [];
  let i = tree.length - 1 - index;
  while (i > 0) {
    const sibling = i % 2 === 0 ? i - 1 : i + 1;
    proof.push(tree[sibling]);
    i = Math.floor((i - 1) / 2);
  }
  return proof;
}

// ─── unsorted mode — positional layers, odd nodes self-paired ───────────

function makeUnsortedLayers(leaves: Hex[]): Hex[][] {
  const layers: Hex[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const current = layers[layers.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(hashOrderedPair(current[i], current[i + 1] ?? current[i]));
    }
    layers.push(next);
  }
  return layers;
}

function unsortedProof(leaves: Hex[], index: number): Hex[] {
  const layers = makeUnsortedLayers(leaves);
  const proof: Hex[] = [];
  let i = index;
  for (const layer of layers.slice(0, -1)) {
    const sibling = i ^ 1;
    proof.push(layer[sibling] ?? layer[i]);
    i >>= 1;
  }
  return proof;
}

// ─── public API ─────────────────────────────────────────────────────────

export function merkleRoot(leaves: Hex[], mode: MerkleMode): Hex {
  if (mode === "sorted") return makeSortedTree(leaves)[0];
  const layers = makeUnsortedLayers(leaves);
  return layers[layers.length - 1][0];
}

export function merkleProof(
  leaves: Hex[],
  index: number,
  mode: MerkleMode,
): Hex[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new ErrorException(
      `<index> must be between 0 and ${leaves.length - 1}, got ${index}`,
    );
  }
  return mode === "sorted"
    ? sortedProof(leaves, index)
    : unsortedProof(leaves, index);
}

function hexEq(a: Hex, b: Hex): boolean {
  return BigInt(a) === BigInt(b);
}

/** Sorted-pair verification (OpenZeppelin `MerkleProof` semantics). */
export function verifySorted(root: Hex, leaf: Hex, proof: Hex[]): boolean {
  return hexEq(
    proof.reduce((acc, sibling) => hashSortedPair(acc, sibling), leaf),
    root,
  );
}

/**
 * Positional verification: fold one bit of the leaf index per sibling
 * (Optimism/Hop `Lib_MerkleTree.verify` semantics).
 */
export function verifyUnsorted(
  root: Hex,
  leaf: Hex,
  proof: Hex[],
  index: number,
): boolean {
  let computed = leaf;
  let i = index;
  for (const sibling of proof) {
    computed =
      i % 2 === 0
        ? hashOrderedPair(computed, sibling)
        : hashOrderedPair(sibling, computed);
    i >>= 1;
  }
  return hexEq(computed, root);
}
