import type { Address } from "../types";

/**
 * The two contracts every compiled on-chain expression is built against.
 * Both are deployed at deterministic CREATE2 addresses, identical on every
 * chain, so there is nothing to configure: a fork that wants different code
 * at these addresses installs it there (see `installAssertionsCore` in
 * `@evmcrispr/test-utils`), which keeps compiled calldata byte-identical to
 * what production emits.
 */

/** Canonical address of the Assertions core v2.0 (interim deployment). */
export const CORE_ADDRESS: Address =
  "0xA01bC220Efc4c730BBcBC9ee52EE570D33EA956F";

/** Canonical address of the Operators v1.0 (interim deployment). */
export const OPERATORS_ADDRESS: Address =
  "0x8e832Ace3f433943eb605c258bA37AF24a69dC53";
