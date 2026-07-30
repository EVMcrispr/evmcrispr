import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Zk extends defineModule("zk", commands, helpers) {}

// Shared primitives for protocol modules built on zk (std → token precedent).
// Everything heavy stays lazily loaded behind these functions.
export {
  derivePublicKey,
  deriveSecretScalar,
  parseSecret,
  signMessage,
  verifySignature,
} from "./utils/eddsa";
export {
  BN254_PRIME,
  parseFieldInput,
  randomFieldElement,
  toField,
} from "./utils/field";
export { loadPoseidon, loadPoseidon2 } from "./utils/poseidon";
export {
  type FetchContext,
  fetchArtifact,
  fullProve,
  type ProofSystem,
  verifyProof,
} from "./utils/snarkjs";
export {
  type Hash2,
  leanProof,
  leanRoot,
  leanVerify,
} from "./utils/tree";
