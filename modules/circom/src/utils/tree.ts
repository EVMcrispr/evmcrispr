/**
 * Poseidon Merkle-tree primitives over BN254 field-element leaves.
 *
 * Two tree conventions are supported:
 *
 * - `lean` — a port of zk-kit's LeanIMT (https://github.com/privacy-scaling-explorations/zk-kit,
 *   MIT), the tree used by Semaphore v4. Depth grows with the leaf count, a
 *   node without a right sibling is propagated up unchanged (no zero
 *   padding), and a single-leaf tree has root = leaf. Proofs carry one
 *   sibling per level that has one; the accompanying path index packs the
 *   left/right bit of only those levels (it equals the leaf index whenever
 *   every level has a sibling, i.e. for power-of-two trees).
 *
 * - `fixed` (`depth:<n>`) — a zero-padded incremental tree of static depth,
 *   the convention of Tornado-style contracts and Semaphore v3: missing
 *   right children are replaced by the zero chain Z0 = 0,
 *   Z(i+1) = H(Zi, Zi), and proofs always have exactly `depth` siblings
 *   folded by the bits of the leaf index.
 *
 * The pair hash is injected so these stay pure bigint; helpers pass
 * 2-arity Poseidon.
 */
import { ErrorException } from "@evmcrispr/sdk";

export type Hash2 = (a: bigint, b: bigint) => bigint;

export type TreeMode = { kind: "lean" } | { kind: "fixed"; depth: number };

export const MAX_FIXED_DEPTH = 32;

/** Build the tree mode from the helpers' `lean:` / `depth:` named args. */
export function buildTreeMode(args: {
  lean?: unknown;
  depth?: unknown;
}): TreeMode {
  if (args.lean === true && args.depth !== undefined) {
    throw new ErrorException(
      "lean: and depth: are mutually exclusive — a lean tree has no fixed depth",
    );
  }
  if (args.depth === undefined) return { kind: "lean" };
  const depth = Number(String(args.depth));
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_FIXED_DEPTH) {
    throw new ErrorException(
      `depth: must be between 1 and ${MAX_FIXED_DEPTH}, got ${String(args.depth)}`,
    );
  }
  return { kind: "fixed", depth };
}

export interface TreeProofOptions {
  mode: TreeMode;
  /** Zero-pad lean siblings to this length (circuits take fixed arrays). */
  pad?: number;
}

/** Build @circom:tree.proof's options from its `lean:`/`depth:`/`pad:` named
 *  args. */
export function buildTreeProofOptions(args: {
  lean?: unknown;
  depth?: unknown;
  pad?: unknown;
}): TreeProofOptions {
  const mode = buildTreeMode(args);
  let pad: number | undefined;
  if (args.pad !== undefined) {
    pad = Number(String(args.pad));
    if (!Number.isInteger(pad) || pad < 1 || pad > MAX_FIXED_DEPTH) {
      throw new ErrorException(
        `pad: must be between 1 and ${MAX_FIXED_DEPTH}, got ${String(args.pad)}`,
      );
    }
    if (mode.kind === "fixed") {
      throw new ErrorException(
        "pad: only applies to lean trees — fixed-depth proofs already have exactly depth siblings",
      );
    }
  }
  return { mode, pad };
}

function checkIndex(index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new ErrorException(
      `<index> must be between 0 and ${length - 1}, got ${index}`,
    );
  }
}

function checkCapacity(leaves: bigint[], depth: number): void {
  if (leaves.length > 2 ** depth) {
    throw new ErrorException(
      `<leaves> exceeds the capacity of a depth-${depth} tree (${leaves.length} > ${2 ** depth})`,
    );
  }
}

function hashLevel(level: bigint[], h: Hash2, zero?: bigint): bigint[] {
  const next: bigint[] = [];
  for (let i = 0; i < level.length; i += 2) {
    const right = level[i + 1] ?? zero;
    next.push(right === undefined ? level[i] : h(level[i], right));
  }
  return next;
}

// --- lean (LeanIMT) ---

export function leanRoot(leaves: bigint[], h: Hash2): bigint {
  let level = leaves;
  while (level.length > 1) {
    level = hashLevel(level, h);
  }
  return level[0];
}

export function leanProof(
  leaves: bigint[],
  index: number,
  h: Hash2,
): { siblings: bigint[]; pathIndex: number } {
  checkIndex(index, leaves.length);
  const siblings: bigint[] = [];
  let pathIndex = 0;
  let level = leaves;
  let i = index;
  while (level.length > 1) {
    const siblingIndex = i ^ 1;
    if (siblingIndex < level.length) {
      if (i & 1) pathIndex |= 1 << siblings.length;
      siblings.push(level[siblingIndex]);
    }
    level = hashLevel(level, h);
    i >>= 1;
  }
  return { siblings, pathIndex };
}

export function leanVerify(
  root: bigint,
  leaf: bigint,
  pathIndex: number,
  siblings: bigint[],
  h: Hash2,
): boolean {
  let node = leaf;
  for (let i = 0; i < siblings.length; i++) {
    node = (pathIndex >> i) & 1 ? h(siblings[i], node) : h(node, siblings[i]);
  }
  return node === root;
}

// --- fixed depth (zero-padded) ---

/** Zero chain: zeros(d)[i] is the all-empty subtree root at level i. */
export function zeros(depth: number, h: Hash2): bigint[] {
  const chain = [0n];
  for (let i = 1; i <= depth; i++) {
    chain.push(h(chain[i - 1], chain[i - 1]));
  }
  return chain;
}

export function fixedRoot(leaves: bigint[], depth: number, h: Hash2): bigint {
  checkCapacity(leaves, depth);
  const chain = zeros(depth, h);
  let level = leaves;
  for (let d = 0; d < depth; d++) {
    level = hashLevel(level, h, chain[d]);
  }
  return level[0];
}

export function fixedProof(
  leaves: bigint[],
  index: number,
  depth: number,
  h: Hash2,
): bigint[] {
  checkCapacity(leaves, depth);
  checkIndex(index, leaves.length);
  const chain = zeros(depth, h);
  const siblings: bigint[] = [];
  let level = leaves;
  let i = index;
  for (let d = 0; d < depth; d++) {
    siblings.push(level[i ^ 1] ?? chain[d]);
    level = hashLevel(level, h, chain[d]);
    i >>= 1;
  }
  return siblings;
}

export function fixedVerify(
  root: bigint,
  leaf: bigint,
  index: number,
  siblings: bigint[],
  h: Hash2,
): boolean {
  checkIndex(index, 2 ** siblings.length);
  let node = leaf;
  for (let i = 0; i < siblings.length; i++) {
    node = (index >> i) & 1 ? h(siblings[i], node) : h(node, siblings[i]);
  }
  return node === root;
}
