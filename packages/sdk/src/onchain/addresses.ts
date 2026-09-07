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
  "0xA55E47Df0739353DFd7a914d65d935624F88A45d";

/** Canonical address of Operations (CREATE2): scalar computation over
 *  resolved values. */
export const OPERATIONS_ADDRESS: Address =
  "0x09e4A7eD11DeF3e3b98d9bB70995043cb51766CE";

/** Canonical address of Collections (CREATE2): iteration and the
 *  ABI-valued collection family (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0xc011EC7840D287b6b7Ccbad6E8Ef7D7C8411Ca19";

/** Canonical address of Expressions (CREATE2): typed expression graphs
 *  (`evaluate`), the host of collection callbacks compiled as graphs.
 *  Resolve-once call construction is the core's (`get`, `gather`). */
export const EXPRESSIONS_ADDRESS: Address =
  "0xe5594E555895542163715a3348B379976Acdfc81";
