import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Noir extends defineModule("noir", commands, helpers) {}

// Shared primitives for protocol modules built on noir (zk precedent).
// Everything heavy stays lazily loaded behind these functions.
export {
  buildOracle,
  getVerifierSource,
  getVkey,
  type Oracle,
  parseOracleValue,
  proveUltraHonk,
  type UltraHonkProof,
  verifyUltraHonk,
} from "./utils/barretenberg";
export {
  artifactCompileKey,
  type CompileNoirResult,
  compileNoirCached,
  type FetchContext,
  type NoirProgramArtifact,
  parseArtifactJson,
} from "./utils/noir";
export { parseProofJson } from "./utils/proof";
