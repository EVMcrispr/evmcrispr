import type { Address } from "viem";

/**
 * Semaphore v4 canonical deployments — the same CREATE2 addresses on every
 * supported network. Deploy blocks verified 2026-07-30 via Blockscout
 * contract-creation lookups (keyless API).
 */
export const SEMAPHORE_ADDRESS: Address =
  "0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D";

/** Documented for completeness — the adapter only calls the main contract. */
export const SEMAPHORE_VERIFIER: Address =
  "0x4DeC9E3784EcC1eE002001BfE91deEf4A48931f8";
export const POSEIDON_T3: Address =
  "0xB43122Ecb241DD50062641f089876679fd06599a";

/** Block the singleton was deployed at, bounding member event scans. */
export const SEMAPHORE_DEPLOY_BLOCK: Record<number, bigint> = {
  1: 23311419n,
  100: 42592255n,
  10200: 18246900n,
  11155111: 9118044n,
};
