import type { Abi, AbiFunction } from "viem";
import { toFunctionSelector } from "viem";

const OPENCHAIN_LOOKUP =
  "https://api.openchain.xyz/signature-database/v1/lookup";

/** selector → signature (null = looked up, not found). Failures are not
 *  cached so a flaky network can recover on the next call. */
const signatureCache = new Map<string, string | null>();

/**
 * Resolve a 4-byte selector to a human-readable function signature via the
 * openchain.xyz signature database. Returns null when unknown or on any
 * network failure — callers must treat the result as best-effort.
 */
export async function lookupFunctionSignature(
  selector: string,
): Promise<string | null> {
  const cached = signatureCache.get(selector);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(
      `${OPENCHAIN_LOOKUP}?function=${selector}&filter=true`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { function?: Record<string, { name: string }[] | null> };
    };
    const signature = json.result?.function?.[selector]?.[0]?.name ?? null;
    signatureCache.set(selector, signature);
    return signature;
  } catch {
    return null;
  }
}

/** Find the function entry of an ABI whose selector matches. Malformed
 *  entries (e.g. from unverified-source APIs) are skipped, not thrown. */
export function findAbiFunctionBySelector(
  abi: Abi,
  selector: string,
): AbiFunction | undefined {
  return abi.find((entry): entry is AbiFunction => {
    if (entry.type !== "function") return false;
    try {
      return toFunctionSelector(entry) === selector;
    } catch {
      return false;
    }
  });
}
