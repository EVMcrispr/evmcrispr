import { defineModule, ErrorException } from "@evmcrispr/sdk";
import { commands, configs, helpers } from "./_generated";

export interface StoredIdentity {
  seed: string;
  secretScalar: bigint;
  publicKey: [bigint, bigint];
  commitment: bigint;
}

interface MemberCacheEntry {
  members: bigint[];
  lastBlock: bigint;
}

export default class Semaphore extends defineModule(
  "semaphore",
  commands,
  helpers,
  undefined,
  undefined,
  configs,
) {
  /**
   * Identity secrets live only here for the session, keyed by commitment —
   * never in bindings, so scripts can print and share every variable.
   */
  #identities = new Map<string, StoredIdentity>();
  #memberCache = new Map<string, MemberCacheEntry>();

  storeIdentity(identity: StoredIdentity): void {
    this.#identities.set(identity.commitment.toString(), identity);
  }

  /**
   * The stored identity for a commitment; with no argument, the only
   * stored identity (clear errors otherwise).
   */
  requireIdentity(commitment?: bigint): StoredIdentity {
    if (commitment !== undefined) {
      const identity = this.#identities.get(commitment.toString());
      if (!identity) {
        throw new ErrorException(
          `semaphore: no identity with commitment ${commitment} in this session — derive it first with semaphore:identity`,
        );
      }
      return identity;
    }
    if (this.#identities.size === 1) {
      return this.#identities.values().next().value as StoredIdentity;
    }
    throw new ErrorException(
      this.#identities.size === 0
        ? "semaphore: no identity in this session — derive one with semaphore:identity"
        : "semaphore: several identities in this session — pass --identity <commitment>",
    );
  }

  getMemberCache(key: string): MemberCacheEntry | undefined {
    return this.#memberCache.get(key);
  }

  setMemberCache(key: string, entry: MemberCacheEntry): void {
    this.#memberCache.set(key, entry);
  }
}
