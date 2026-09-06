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

/** Canonical address of the Operations v1.0 (retained CREATE2 salt). */
export const OPERATIONS_ADDRESS: Address =
  "0x69Db28Fef09ca3f814c6701589EE96C20593ae66";

/** Generic ABI-valued collection periphery (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0xc011Ec7Cc443dA1218Da699EFd09639f35dd8379";
