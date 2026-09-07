import type { Address } from "../types";

/**
 * The core and periphery addresses used by compiled on-chain expressions.
 * All four are deployed at deterministic CREATE2 addresses, identical on
 * every chain, so there is nothing to configure: a fork that wants
 * different code at these addresses installs it there (see
 * `installAssertionsCore` in `@evmcrispr/test-utils`), which keeps
 * compiled calldata byte-identical to what production emits.
 */

/** Canonical address of the Assertions core (CREATE2). */
export const CORE_ADDRESS: Address =
  "0xa55E477cF2a24506317f0B2555e8B443522CBBf0";

/** Canonical address of Operations (CREATE2): scalar computation over
 *  resolved values. */
export const OPERATIONS_ADDRESS: Address =
  "0x09e4A7eD11DeF3e3b98d9bB70995043cb51766CE";

/** Canonical address of Collections (CREATE2): iteration and the
 *  ABI-valued collection family (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0xC011EC7e97deC05655D3d169e44aB87217996b19";

/** Canonical address of Expressions (CREATE2): typed expression graphs
 *  (`evaluate`), the host of collection callbacks compiled as graphs.
 *  Resolve-once call construction is the core's (`get`, `gather`). */
export const EXPRESSIONS_ADDRESS: Address =
  "0xe5594E55E0fc24a271CA6bf55070a6bE63Cc43d8";
