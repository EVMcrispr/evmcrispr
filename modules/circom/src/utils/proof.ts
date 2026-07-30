/**
 * Parsing of the proof JSON bound by `circom:prove` into on-chain verifier
 * arguments, for every supported proof system.
 *
 * groth16: snarkjs encodes G2 points (pi_b) with the Fp2 coordinates in
 * the order (x.a, x.b); Solidity's pairing precompile — and therefore
 * every snarkjs-exported verifier — expects them swapped to (x.b, x.a).
 * `parseProofJson` performs that swap once, so the arrays it returns are
 * ready to pass to `verifyProof` as-is. It also drops the projective
 * third coordinate ("1") snarkjs appends to pi_a/pi_c.
 *
 * plonk/fflonk proofs carry only G1 points and evaluations; their
 * verifiers take a flat `uint256[24]` (field order mirroring snarkjs's
 * exportSolidityCallData, unit-tested against it).
 */
import { ErrorException } from "@evmcrispr/sdk";
import type { ProofSystem } from "./snarkjs";

export type ParsedProof =
  | {
      protocol: "groth16";
      a: [bigint, bigint];
      b: [[bigint, bigint], [bigint, bigint]];
      c: [bigint, bigint];
      signals: bigint[];
    }
  | {
      protocol: "plonk" | "fflonk";
      proof: bigint[];
      signals: bigint[];
    };

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

/** plonk verifier calldata order (verifier_plonk.sol.ejs / exportSolidityCallData). */
const PLONK_POINTS = ["A", "B", "C", "Z", "T1", "T2", "T3", "Wxi", "Wxiw"];
const PLONK_EVALS = [
  "eval_a",
  "eval_b",
  "eval_c",
  "eval_s1",
  "eval_s2",
  "eval_zw",
];

/** fflonk verifier calldata order (verifier_fflonk.sol.ejs / export_calldata). */
const FFLONK_POINTS = ["C1", "C2", "W1", "W2"];
const FFLONK_EVALS = [
  "ql",
  "qr",
  "qm",
  "qo",
  "qc",
  "s1",
  "s2",
  "s3",
  "a",
  "b",
  "c",
  "z",
  "zw",
  "t1w",
  "t2w",
  "inv",
];

export function parseProofJson(value: unknown, argName = "proof"): ParsedProof {
  if (typeof value !== "string") {
    throw new ErrorException(
      `<${argName}> must be the JSON string bound by circom:prove, got ${value}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ErrorException(
      `<${argName}> is not valid JSON — bind it with circom:prove`,
    );
  }
  const { proof, publicSignals } = (parsed ?? {}) as {
    proof?: Record<string, unknown>;
    publicSignals?: unknown[];
  };
  if (!proof || typeof proof !== "object" || !Array.isArray(publicSignals)) {
    throw new ErrorException(
      `<${argName}> must be a JSON object with "proof" and "publicSignals" — bind it with circom:prove`,
    );
  }
  const coord = (v: unknown) => toBigIntCoord(v, argName);
  const signals = publicSignals.map(coord);
  const protocol = (proof.protocol as string | undefined) ?? "groth16";

  if (protocol === "groth16") {
    const { pi_a, pi_b, pi_c } = proof as {
      pi_a?: unknown[];
      pi_b?: unknown[][];
      pi_c?: unknown[];
    };
    if (!Array.isArray(pi_a) || !Array.isArray(pi_b) || !Array.isArray(pi_c)) {
      throw new ErrorException(
        `<${argName}> is missing groth16 proof points (pi_a, pi_b, pi_c) — bind it with circom:prove`,
      );
    }
    return {
      protocol,
      a: [coord(pi_a[0]), coord(pi_a[1])],
      // Swap each Fp2 coordinate pair for the Solidity pairing precompile.
      b: [
        [coord(pi_b[0][1]), coord(pi_b[0][0])],
        [coord(pi_b[1][1]), coord(pi_b[1][0])],
      ],
      c: [coord(pi_c[0]), coord(pi_c[1])],
      signals,
    };
  }

  if (protocol === "plonk") {
    const flat: bigint[] = [];
    for (const point of PLONK_POINTS) {
      const p = proof[point] as unknown[];
      if (!Array.isArray(p)) {
        throw new ErrorException(
          `<${argName}> is missing plonk proof point ${point}`,
        );
      }
      flat.push(coord(p[0]), coord(p[1]));
    }
    for (const evaluation of PLONK_EVALS) {
      flat.push(coord(proof[evaluation]));
    }
    return { protocol, proof: flat, signals };
  }

  if (protocol === "fflonk") {
    const polynomials = proof.polynomials as
      | Record<string, unknown[]>
      | undefined;
    const evaluations = proof.evaluations as
      | Record<string, unknown>
      | undefined;
    if (!polynomials || !evaluations) {
      throw new ErrorException(
        `<${argName}> is missing fflonk polynomials/evaluations`,
      );
    }
    const flat: bigint[] = [];
    for (const point of FFLONK_POINTS) {
      const p = polynomials[point];
      if (!Array.isArray(p)) {
        throw new ErrorException(
          `<${argName}> is missing fflonk polynomial ${point}`,
        );
      }
      flat.push(coord(p[0]), coord(p[1]));
    }
    for (const evaluation of FFLONK_EVALS) {
      flat.push(coord(evaluations[evaluation]));
    }
    return { protocol, proof: flat, signals };
  }

  throw new ErrorException(
    `<${argName}> is a ${protocol} proof — supported protocols: groth16, plonk, fflonk`,
  );
}

/**
 * Proof system of a .zkey, from its binfile header (magic "zkey",
 * header section protocolId: 1 = groth16, 2 = plonk, 10 = fflonk).
 */
export function parseZkeyProtocol(zkey: Uint8Array): ProofSystem {
  const view = new DataView(zkey.buffer, zkey.byteOffset, zkey.byteLength);
  if (zkey.length < 12 || view.getUint32(0, true) !== 0x79656b7a) {
    throw new ErrorException("circom:prove: malformed zkey (bad magic)");
  }
  const nSections = view.getUint32(8, true);
  let offset = 12;
  for (let s = 0; s < nSections; s++) {
    const type = view.getUint32(offset, true);
    const size = Number(view.getBigUint64(offset + 4, true));
    offset += 12;
    if (type === 1) {
      const protocolId = view.getUint32(offset, true);
      if (protocolId === 1) return "groth16";
      if (protocolId === 2) return "plonk";
      if (protocolId === 10) return "fflonk";
      throw new ErrorException(
        `circom:prove: unsupported zkey protocol id ${protocolId}`,
      );
    }
    offset += size;
  }
  throw new ErrorException("circom:prove: malformed zkey (no header section)");
}
