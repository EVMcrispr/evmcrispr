/**
 * Proof plumbing: signal value semantics, the contract's signal hash,
 * ceremony artifact URLs, Groth16 point packing and the bound proof JSON
 * (shaped exactly like the on-chain SemaphoreProof struct, with RAW
 * message/scope — the contract hashes them internally when verifying).
 */
import { ErrorException, Num } from "@evmcrispr/sdk";
import { encodePacked, keccak256, toHex } from "viem";

/** Pinned artifact release from the real Semaphore ceremony. */
export const SEMAPHORE_ARTIFACTS_VERSION = "4.13.0";
const ARTIFACTS_BASE = "https://snark-artifacts.pse.dev/semaphore";

export function artifactUrls(depth: number): { wasm: string; zkey: string } {
  if (!Number.isInteger(depth) || depth < 1 || depth > 32) {
    throw new ErrorException(
      `semaphore: tree depth must be between 1 and 32, got ${depth}`,
    );
  }
  const base = `${ARTIFACTS_BASE}/${SEMAPHORE_ARTIFACTS_VERSION}/semaphore-${depth}`;
  return { wasm: `${base}.wasm`, zkey: `${base}.zkey` };
}

const UINT256_MAX = (1n << 256n) - 1n;

/**
 * Message/scope value semantics, mirroring @semaphore-protocol/utils
 * toBigInt: numbers and numeric/hex strings pass through as uint256; any
 * other string is its UTF-8 bytes as a bigint — so proofs made here match
 * the reference SDK's for the same inputs.
 */
export function parseSignalValue(value: unknown, argName: string): bigint {
  let parsed: bigint | undefined;
  if (typeof value === "boolean") {
    parsed = value ? 1n : 0n;
  } else if (typeof value === "string") {
    if (value === "") {
      throw new ErrorException(`<${argName}> must not be empty`);
    }
    const trimmed = value.trim();
    parsed = /^(\d+|0x[0-9a-fA-F]+)$/.test(trimmed)
      ? BigInt(trimmed)
      : BigInt(toHex(value));
  } else {
    try {
      const num = Num(value);
      if (!num.isInteger()) throw new Error("non-integer");
      parsed = num.toBigInt();
    } catch {
      throw new ErrorException(
        `<${argName}> must be a number, hex value or string, got ${value}`,
      );
    }
  }
  if (parsed < 0n || parsed > UINT256_MAX) {
    throw new ErrorException(`<${argName}> does not fit in a uint256`);
  }
  return parsed;
}

/** The contract's internal signal hash: keccak256(abi.encodePacked(x)) >> 8. */
export function hashSignal(value: bigint): bigint {
  return BigInt(keccak256(encodePacked(["uint256"], [value]))) >> 8n;
}

/**
 * Pack a snarkjs Groth16 proof into the verifier's uint256[8], in
 * @zk-kit/utils packGroth16Proof order (pi_b Fp2 coordinates swapped).
 */
export function packPoints(proof: Record<string, unknown>): bigint[] {
  const { pi_a, pi_b, pi_c } = proof as {
    pi_a?: unknown[];
    pi_b?: unknown[][];
    pi_c?: unknown[];
  };
  if (!Array.isArray(pi_a) || !Array.isArray(pi_b) || !Array.isArray(pi_c)) {
    throw new ErrorException("semaphore: malformed groth16 proof");
  }
  return [
    pi_a[0],
    pi_a[1],
    pi_b[0][1],
    pi_b[0][0],
    pi_b[1][1],
    pi_b[1][0],
    pi_c[0],
    pi_c[1],
  ].map((v) => BigInt(v as string));
}

export interface SemaphoreProofJson {
  merkleTreeDepth: bigint;
  merkleTreeRoot: bigint;
  nullifier: bigint;
  message: bigint;
  scope: bigint;
  points: bigint[];
}

export function buildProofJson(proof: SemaphoreProofJson): string {
  return JSON.stringify({
    merkleTreeDepth: proof.merkleTreeDepth.toString(),
    merkleTreeRoot: proof.merkleTreeRoot.toString(),
    nullifier: proof.nullifier.toString(),
    message: proof.message.toString(),
    scope: proof.scope.toString(),
    points: proof.points.map((p) => p.toString()),
  });
}

export function parseProofJson(
  value: unknown,
  argName = "proof",
): SemaphoreProofJson {
  if (typeof value !== "string") {
    throw new ErrorException(
      `<${argName}> must be the proof JSON bound by semaphore:prove, got ${value}`,
    );
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ErrorException(`<${argName}> is not valid JSON`);
  }
  const fields = [
    "merkleTreeDepth",
    "merkleTreeRoot",
    "nullifier",
    "message",
    "scope",
  ] as const;
  const result: Partial<SemaphoreProofJson> = {};
  for (const field of fields) {
    const raw = parsed?.[field];
    if (typeof raw !== "string" && typeof raw !== "number") {
      throw new ErrorException(
        `<${argName}> is missing "${field}" — bind it with semaphore:prove`,
      );
    }
    result[field] = BigInt(raw);
  }
  const points = parsed?.points;
  if (!Array.isArray(points) || points.length !== 8) {
    throw new ErrorException(`<${argName}> must carry exactly 8 proof points`);
  }
  result.points = points.map((p) => BigInt(p as string));
  return result as SemaphoreProofJson;
}
