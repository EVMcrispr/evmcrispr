import type { Address } from "../types";

/**
 * The four contract addresses compiled on-chain expressions target. Each is
 * deployed at a deterministic CREATE2 address, identical on every chain, so
 * there is nothing to configure: a fork that wants different code at these
 * addresses installs it there (see `installAssertionsCore` in
 * `@evmcrispr/test-utils`), which keeps compiled calldata byte-identical to
 * what production emits.
 *
 * These move whenever a contract's bytecode does, comments included. They are
 * generated from the contracts repo's `website/src/lib/deployments.json`; keep
 * them in step with it and with the runtime fixture in
 * `@evmcrispr/test-utils/onchain/assertions-bytecode`.
 */

/** Canonical address of the Assertions core (CREATE2). */
export const CORE_ADDRESS: Address =
  "0xA55e479Cfb10A70BA33560ecAf5dd29C3fDE8531";

/** Canonical address of Operations (CREATE2): scalar computation over
 *  resolved values. */
export const OPERATIONS_ADDRESS: Address =
  "0x09E4A7Ef72b44d3E16466Ca3517Af567eA7D8aDA";

/** Canonical address of Collections (CREATE2): iteration and the
 *  ABI-valued collection family (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0xC011ec718c89903c3c5348837877f0FFCa67B500";

/** Canonical address of Expressions (CREATE2): typed expression graphs
 *  (`evaluate`), the host of collection callbacks compiled as graphs.
 *  Resolve-once call construction is the core's (`get`, `gather`). */
export const EXPRESSIONS_ADDRESS: Address =
  "0xe5594E555dF45DbF1a5622ED73e282EDb42e7930";
