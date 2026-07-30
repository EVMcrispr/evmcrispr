/**
 * EdDSA over Baby Jubjub with Poseidon (the circom-ecosystem signature
 * scheme — Semaphore v4 identities, MACI keys, zk-kit). Thin lazy-loaded
 * wrappers over @zk-kit/eddsa-poseidon, normalizing to bigint at the
 * boundary.
 */
import { ErrorException } from "@evmcrispr/sdk";

interface EddsaLib {
  derivePublicKey(privateKey: string): [bigint, bigint] | [string, string];
  signMessage(
    privateKey: string,
    message: bigint,
  ): { R8: [bigint, bigint] | [string, string]; S: bigint | string };
  verifySignature(
    message: bigint,
    signature: { R8: [bigint, bigint]; S: bigint },
    publicKey: [bigint, bigint],
  ): boolean;
}

let eddsaPromise: Promise<EddsaLib> | undefined;

function loadEddsa(): Promise<EddsaLib> {
  if (!eddsaPromise) {
    eddsaPromise = import("@zk-kit/eddsa-poseidon") as Promise<EddsaLib>;
    eddsaPromise.catch(() => {
      eddsaPromise = undefined;
    });
  }
  return eddsaPromise;
}

/** Normalize the secret argument: any non-empty string works as a seed. */
export function parseSecret(value: unknown, argName: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ErrorException(
      `<${argName}> must be a non-empty string or hex value`,
    );
  }
  return value;
}

export async function derivePublicKey(
  secret: string,
): Promise<[bigint, bigint]> {
  const eddsa = await loadEddsa();
  const [x, y] = eddsa.derivePublicKey(secret);
  return [BigInt(x), BigInt(y)];
}

export async function signMessage(
  secret: string,
  message: bigint,
): Promise<{ r8: [bigint, bigint]; s: bigint }> {
  const eddsa = await loadEddsa();
  const { R8, S } = eddsa.signMessage(secret, message);
  return { r8: [BigInt(R8[0]), BigInt(R8[1])], s: BigInt(S) };
}

export async function verifySignature(
  message: bigint,
  r8: [bigint, bigint],
  s: bigint,
  publicKey: [bigint, bigint],
): Promise<boolean> {
  const eddsa = await loadEddsa();
  try {
    return eddsa.verifySignature(message, { R8: r8, S: s }, publicKey);
  } catch {
    // Malformed points (not on curve etc.) are just invalid signatures.
    return false;
  }
}
