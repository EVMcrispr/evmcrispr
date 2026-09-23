import type { Address } from "viem";

/** `EEZL2` predeploy address on every EEZ rollup. */
export const EEZ_L2_PREDEPLOY: Address =
  "0x4200000000000000000000000000000000000007";

export interface EezChainInfo {
  /** `EEZ` (L1) or `EEZL2` (rollup) registry on this chain. */
  registry: Address;
  /** This chain's rollup id (0 = L1). */
  rollupId: bigint;
  /** Rollup id used when the caller doesn't name one: the other side. */
  peerRollupId: bigint;
  /** Chain id of that other side, for messages. */
  peerChainId: number;
  /** Private key of an account pre-funded on this (throwaway) devnet,
   *  used by `eez:faucet`. Never a secret: it is a public hardhat key. */
  faucetKey?: `0x${string}`;
}

/** Anvil account #1 — funded in the rollup's genesis and, unlike #0, not
 *  the devnet operator's busy key. It holds nothing on Chiado, a public
 *  testnet, so the faucet only serves the rollup. */
const DEVNET_FAUCET_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

/** Built-in deployments, keyed by chain id (see `chains.ts`). */
export const EEZ_CHAINS: Record<number, EezChainInfo> = {
  // Gnosis Chiado: the devnet's settlement layer. The registry was found on
  // chain (2026-09-23): the only contract answering the EEZ interface, with
  // one registered rollup, id 1.
  10200: {
    registry: "0xC412aAE1361bcd8Da4581153Df182f293437fdD7",
    rollupId: 0n,
    peerRollupId: 1n,
    peerChainId: 6291,
  },
  6291: {
    registry: EEZ_L2_PREDEPLOY,
    rollupId: 1n,
    peerRollupId: 0n,
    peerChainId: 10200,
    faucetKey: DEVNET_FAUCET_KEY,
  },
};
