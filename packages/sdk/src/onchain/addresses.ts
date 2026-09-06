import type { Address } from "../types";

/**
 * The core and periphery addresses used by compiled on-chain expressions.
 * Both are deployed at deterministic CREATE2 addresses, identical on every
 * chain, so there is nothing to configure: a fork that wants different code
 * at these addresses installs it there (see `installAssertionsCore` in
 * `@evmcrispr/test-utils`), which keeps compiled calldata byte-identical to
 * what production emits.
 */

/** Canonical address of the Assertions core v2.0 (vanity CREATE2 salt). */
export const CORE_ADDRESS: Address =
  "0x8794b0d097C07e7520B421d02201E34c9eE3E156";

/** Canonical address of the Operators v1.0 (vanity CREATE2 salt). */
export const OPERATORS_ADDRESS: Address =
  "0x7B4F82C8A21dCaf7D96D4113D6d23578d1F0A91D";

/** Generic ABI-valued collection periphery (requires Cancun). */
export const COLLECTION_OPERATORS_ADDRESS: Address =
  "0x87841575F679dA8E877db0A95b1bCF2C0d0D55dc";
