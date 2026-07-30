/**
 * Semaphore v4 identities: an EdDSA (Baby Jubjub, Poseidon) keypair
 * derived from an arbitrary seed string; the identity commitment is
 * poseidon2 of the public key. The default seed is the wallet's
 * personal_sign signature over a fixed message, making identities
 * deterministic per wallet and recoverable by re-signing.
 */
import {
  derivePublicKey,
  deriveSecretScalar,
  loadPoseidon2,
} from "@evmcrispr/module-zk";

/** Changing this string changes every wallet-derived identity — never touch. */
export const IDENTITY_MESSAGE = "EVMcrispr Semaphore v4 identity";

export interface DerivedIdentity {
  seed: string;
  secretScalar: bigint;
  publicKey: [bigint, bigint];
  commitment: bigint;
}

export async function deriveIdentity(seed: string): Promise<DerivedIdentity> {
  const [secretScalar, publicKey, poseidon2] = await Promise.all([
    deriveSecretScalar(seed),
    derivePublicKey(seed),
    loadPoseidon2(),
  ]);
  return {
    seed,
    secretScalar,
    publicKey,
    commitment: poseidon2(publicKey[0], publicKey[1]),
  };
}
