import { profile as hegota } from "@forshtat/hegota-support/profiles/ethrex-hegota-devnet";
import type { Profile } from "./types";

/**
 * The Hegota devnet's profile (ethrex `hegota-devnet`, chain 3151908), with
 * the atomic batch flag it honours. The library's profile lists no flag
 * bits; on the chain, bit 2 rolls a group back as on the alt-mempool devnet
 * (measured 2026-11-09: a transfer flagged atomic with a reverting frame
 * after it was undone, the same transfer without the flag was kept).
 */
export const ethrexHegotaDevnetProfile: Profile = {
  ...hegota,
  flagBits: { ...hegota.flagBits, ATOMIC_BATCH: 0x4 },
};
