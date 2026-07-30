/**
 * Parsing of the proof JSON bound by `zk:prove` into on-chain verifier
 * arguments.
 *
 * snarkjs encodes G2 points (pi_b) with the Fp2 coordinates in the order
 * (x.a, x.b); Solidity's pairing precompile — and therefore every
 * snarkjs-exported verifier contract — expects them swapped to
 * (x.b, x.a). `parseProofJson` performs that swap once, so the arrays it
 * returns are ready to pass to `verifyProof` as-is. It also drops the
 * projective third coordinate ("1") snarkjs appends to pi_a/pi_c.
 */
import { ErrorException } from "@evmcrispr/sdk";

export interface ParsedProof {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
  signals: bigint[];
}

function toBigIntCoord(value: unknown, argName: string): bigint {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ErrorException(
      `<${argName}> contains a malformed proof coordinate: ${value}`,
    );
  }
  try {
    return BigInt(value);
  } catch {
    throw new ErrorException(
      `<${argName}> contains a malformed proof coordinate: ${value}`,
    );
  }
}

export function parseProofJson(value: unknown, argName = "proof"): ParsedProof {
  if (typeof value !== "string") {
    throw new ErrorException(
      `<${argName}> must be the JSON string bound by zk:prove, got ${value}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ErrorException(
      `<${argName}> is not valid JSON — bind it with zk:prove`,
    );
  }
  const { proof, publicSignals } = (parsed ?? {}) as {
    proof?: {
      pi_a?: unknown[];
      pi_b?: unknown[][];
      pi_c?: unknown[];
      protocol?: string;
    };
    publicSignals?: unknown[];
  };
  if (
    !proof ||
    !Array.isArray(proof.pi_a) ||
    !Array.isArray(proof.pi_b) ||
    !Array.isArray(proof.pi_c) ||
    !Array.isArray(publicSignals)
  ) {
    throw new ErrorException(
      `<${argName}> must be a JSON object with "proof" (pi_a, pi_b, pi_c) and "publicSignals" — bind it with zk:prove`,
    );
  }
  if (proof.protocol !== undefined && proof.protocol !== "groth16") {
    throw new ErrorException(
      `<${argName}> is a ${proof.protocol} proof — only groth16 proofs are supported`,
    );
  }
  const coord = (v: unknown) => toBigIntCoord(v, argName);
  return {
    a: [coord(proof.pi_a[0]), coord(proof.pi_a[1])],
    // Swap each Fp2 coordinate pair for the Solidity pairing precompile.
    b: [
      [coord(proof.pi_b[0][1]), coord(proof.pi_b[0][0])],
      [coord(proof.pi_b[1][1]), coord(proof.pi_b[1][0])],
    ],
    c: [coord(proof.pi_c[0]), coord(proof.pi_c[1])],
    signals: publicSignals.map(coord),
  };
}
