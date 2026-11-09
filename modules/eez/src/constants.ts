import type { Address } from "viem";

/** `EEZL2` manager on the ChiadoX rollup (an upgradeable proxy in its
 *  genesis, no longer the `0x42…07` predeploy of earlier devnets). */
export const EEZ_L2_MANAGER: Address =
  "0x4B2760F84B83d6b3829E30A7573B0172B6d6402C";

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
   *  used by `eez:faucet`. Never a secret: a public hardhat key. None of
   *  the hosted networks has one: their rollups are funded by bridging. */
  faucetKey?: `0x${string}`;
}

/** Built-in deployments, keyed by chain id (see `chains.ts`). */
export const EEZ_CHAINS: Record<number, EezChainInfo> = {
  // ChiadoX, the EEZ team's testnet (https://chiadox.eez.dev, announced at
  // https://eez.dev): Gnosis Chiado settles rollup 2. Addresses from the
  // network's dashboard config and its composer's `eez_composerInfo`,
  // checked on chain (2026-11-10).
  10200: {
    registry: "0x6258189D3a04EB31a196A8931077dfe001A9f6Fd",
    rollupId: 0n,
    peerRollupId: 2n,
    peerChainId: 699169,
  },
  699169: {
    registry: EEZ_L2_MANAGER,
    rollupId: 2n,
    peerRollupId: 0n,
    peerChainId: 10200,
  },
};
