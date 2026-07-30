/**
 * The proof JSON bound by `noir:prove` and consumed by `@noir:verify` /
 * `@noir:proof`: `{proof: "0x…", publicInputs: ["0x…"], oracle}` — the
 * oracle is recorded so downstream helpers never silently verify against
 * the wrong transcript.
 */
import { ErrorException } from "@evmcrispr/sdk";
import { ORACLES, type Oracle, type UltraHonkProof } from "./barretenberg";

const HEX_RE = /^0x[0-9a-fA-F]*$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export function parseProofJson(value: string): UltraHonkProof {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ErrorException(
      "<proof> must be the proof JSON string bound by noir:prove",
    );
  }
  const proof = parsed as UltraHonkProof;
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof proof.proof !== "string" ||
    !HEX_RE.test(proof.proof) ||
    !Array.isArray(proof.publicInputs) ||
    !proof.publicInputs.every(
      (i) => typeof i === "string" && BYTES32_RE.test(i),
    ) ||
    !(ORACLES as string[]).includes(proof.oracle as Oracle)
  ) {
    throw new ErrorException(
      "<proof> must be the proof JSON string bound by noir:prove ({proof, publicInputs, oracle})",
    );
  }
  return proof;
}
