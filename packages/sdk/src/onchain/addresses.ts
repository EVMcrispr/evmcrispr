import type { Address } from "../types";

/**
 * The two contracts every compiled on-chain expression is built against.
 * Both are deployed at deterministic CREATE2 addresses, identical on every
 * chain, so there is nothing to configure: a fork that wants different code
 * at these addresses installs it there (see `installAssertionsCore` in
 * `@evmcrispr/test-utils`), which keeps compiled calldata byte-identical to
 * what production emits.
 */

/** Canonical address of the Assertions core v2.0 (CREATE2 salt). */
export const CORE_ADDRESS: Address =
  "0x67DBB438FdC614466984Dc8F68dAB812d785a2aE";

/** Canonical address of the Operators v1.0 (CREATE2 salt). */
export const OPERATORS_ADDRESS: Address =
  "0x7AD80f224A8473A4206ad486e5b6b4e4367D17AD";
